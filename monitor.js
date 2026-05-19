// Monitor de Licencas Ambientais — pipeline principal.
// Para cada empresa do config.json, busca o CNPJ no DOU do dia,
// filtra publicacoes relevantes e gera um relatorio.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { buscarDOU, dataDeHoje } = require('./dou');
const { enviarAlerta } = require('./alerta');
const { inicializarDB, filtrarNaoAlertadas, marcarComoAlertadas } = require('./dedup');
const { buscarFonte: buscarFonteIBAMA, normalizarCNPJ } = require('./ibama');
const logger = require('./log');

// Carrega config.json e, se existir, mescla config.local.json por cima.
// config.local.json fica fora do git e guarda segredos (ex: API keys).
function carregarConfig() {
  const base = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));
  const localPath = './config.local.json';
  if (fs.existsSync(localPath)) {
    const local = JSON.parse(fs.readFileSync(localPath, 'utf-8'));
    for (const [secao, valores] of Object.entries(local)) {
      base[secao] = { ...(base[secao] || {}), ...valores };
    }
  }
  return base;
}

const config = carregarConfig();

// Verifica se uma publicacao e relevante para monitoramento ambiental.
// Criterios: o tipo OU o titulo contem palavras do filtro configurado.
function ehRelevante(pub) {
  const tipoLower = pub.tipo.toLowerCase();
  const tituloLower = pub.titulo.toLowerCase();
  const resumoLower = pub.resumo.toLowerCase();

  const { tiposRelevantes, palavrasChaveTitulo } = config.filtro;

  const tipoOk = tiposRelevantes.some((t) => tipoLower.includes(t.toLowerCase()));
  const tituloOk = palavrasChaveTitulo.some(
    (p) => tituloLower.includes(p) || resumoLower.includes(p)
  );

  return tipoOk || tituloOk;
}

// Formata um relatorio simples para imprimir no terminal
function imprimirRelatorio(relatorio) {
  const linha = '='.repeat(60);
  console.log(`\n${linha}`);
  console.log(`RELATORIO DO MONITOR DE LICENCAS AMBIENTAIS`);
  console.log(`Data: ${relatorio.data} | Executado em: ${relatorio.executadoEm}`);
  console.log(linha);

  if (relatorio.resultados.length === 0) {
    console.log('\nNenhuma empresa monitorada encontrada no DOU hoje.');
    return;
  }

  let totalAlertas = 0;
  let totalJaAlertadas = 0;
  for (const res of relatorio.resultados) {
    const jaAlertadasN = (res.jaAlertadas || []).length;
    totalJaAlertadas += jaAlertadasN;

    console.log(`\n--- ${res.empresa} (${res.cnpj}) ---`);
    console.log(
      `Publicacoes encontradas: ${res.totalEncontradas} | Novas: ${res.relevantes.length} | Ja alertadas: ${jaAlertadasN}`
    );

    if (res.relevantes.length === 0) {
      console.log('  Nenhuma publicacao nova hoje.');
      continue;
    }

    totalAlertas += res.relevantes.length;
    res.relevantes.forEach((pub, i) => {
      console.log(`\n  [${i + 1}] ${pub.tipo} — ${pub.data}`);
      console.log(`  Orgao:  ${pub.orgaoStr}`);
      console.log(`  Titulo: ${pub.titulo}`);
      console.log(`  Link:   ${pub.link}`);
      console.log(`  Resumo: ${pub.resumo.slice(0, 200)}...`);
    });
  }

  // Secao IBAMA
  let totalIBAMANovas = 0;
  let totalIBAMAJa = 0;
  if (relatorio.ibama) {
    for (const [fonteKey, dados] of Object.entries(relatorio.ibama)) {
      console.log(`\n--- IBAMA: ${fonteKey} ---`);
      if (dados.erro) {
        console.log(`  Erro: ${dados.erro}`);
        continue;
      }
      const novasN = (dados.novas || []).length;
      const jaN = (dados.jaAlertadas || []).length;
      totalIBAMANovas += novasN;
      totalIBAMAJa += jaN;
      console.log(`Total no periodo: ${dados.totalEncontradas} | Novas: ${novasN} | Ja alertadas: ${jaN}`);

      (dados.novas || []).forEach((pub, i) => {
        console.log(`\n  [${i + 1}] ${pub.titulo} — ${pub.data}`);
        console.log(`  Autuado: ${pub.nome} (${pub.cnpj})`);
        console.log(`  Local:   ${pub.municipio}/${pub.uf}`);
        console.log(`  Valor:   R$ ${pub.valor}`);
        console.log(`  Processo: ${pub.processo}`);
        console.log(`  Resumo:  ${(pub.resumo || '').slice(0, 200)}...`);
      });
    }
  }

  console.log(`\n${linha}`);
  console.log(
    `DOU — novos: ${totalAlertas} | ja alertados: ${totalJaAlertadas}`
  );
  console.log(
    `IBAMA — novos: ${totalIBAMANovas} | ja alertados: ${totalIBAMAJa}`
  );
  console.log(linha);
}

async function executarMonitor(opcoes = {}) {
  const arquivoLog = logger.iniciar();
  try {
    return await executarMonitorInterno(opcoes, arquivoLog);
  } catch (err) {
    // Garante que o erro va para o log antes de fechar o stream.
    console.error('Erro fatal no monitor:', err);
    throw err;
  } finally {
    logger.fechar();
  }
}

async function executarMonitorInterno(opcoes, arquivoLog) {
  const hoje = opcoes.data || dataDeHoje();

  if (!hoje) {
    console.log('Hoje e fim de semana. O DOU nao publica aos sabados e domingos. Nada a fazer.');
    return null;
  }

  console.log(`\nIniciando monitoramento para ${hoje}...`);
  console.log(`Empresas monitoradas: ${config.empresas.filter((e) => e.ativa).length}`);
  console.log(`Log desta execucao: ${arquivoLog}`);

  const browser = await chromium.launch({ headless: true });
  const db = inicializarDB();
  // classPK -> { cnpj, empresa } — necessario para enriquecer registros
  // marcados como alertados (a publicacao em si nao traz CNPJ).
  const contextoPorClassPK = {};
  const relatorio = {
    data: hoje,
    executadoEm: new Date().toISOString(),
    resultados: [],
  };

  for (const empresa of config.empresas) {
    if (!empresa.ativa) continue;

    console.log(`\nBuscando: ${empresa.nome} (${empresa.cnpj})...`);

    // Aspas forcam correspondencia exata da frase completa.
    // Sem aspas, o portal tokeniza o CNPJ e retorna falsos positivos.
    const termoBusca = `"${empresa.cnpj}"`;
    const resultado = await buscarDOU(browser, termoBusca, {
      publishFrom: hoje,
      publishTo: hoje,
    });

    const relevantesTodos = resultado.publicacoes.filter(ehRelevante);
    const { novas, jaAlertadas } = filtrarNaoAlertadas(db, relevantesTodos, 'DOU');

    for (const pub of novas) {
      if (pub.classPK) {
        contextoPorClassPK[pub.classPK] = { cnpj: empresa.cnpj, empresa: empresa.nome };
      }
    }

    console.log(
      `  Encontradas: ${resultado.publicacoes.length} | Relevantes: ${relevantesTodos.length} | Ja alertadas: ${jaAlertadas.length} | Novas: ${novas.length}`
    );

    relatorio.resultados.push({
      empresa: empresa.nome,
      cnpj: empresa.cnpj,
      totalEncontradas: resultado.publicacoes.length,
      relevantes: novas,
      jaAlertadas,
      todas: resultado.publicacoes,
    });
  }

  await browser.close();

  // === IBAMA (dados abertos) ===
  // Roda depois do DOU. Erros aqui nao devem derrubar o relatorio do DOU,
  // entao cada fonte tem seu try/catch e o erro vai pro relatorio.
  const cfgIbama = config.ibama || {};
  const contextoIBAMAPorClassPK = {};
  relatorio.ibama = {};

  if (cfgIbama.ativo && Array.isArray(cfgIbama.fontes) && cfgIbama.fontes.length > 0) {
    const empresasAtivas = config.empresas.filter((e) => e.ativa);
    const cnpjsAtivos = empresasAtivas.map((e) => e.cnpj);
    const cnpjParaEmpresa = {};
    for (const e of empresasAtivas) {
      cnpjParaEmpresa[normalizarCNPJ(e.cnpj)] = e;
    }

    for (const fonteKey of cfgIbama.fontes) {
      console.log(`\nConsultando IBAMA: ${fonteKey}...`);
      try {
        const r = await buscarFonteIBAMA(fonteKey, cnpjsAtivos, {
          diasMaximos: cfgIbama.diasMaximos || 30,
        });

        // Atribui empresa do config baseado no CNPJ que casou
        for (const pub of r.publicacoes) {
          const e = cnpjParaEmpresa[normalizarCNPJ(pub.cnpj)];
          pub.empresaConfig = e ? e.nome : '(CNPJ desconhecido)';
        }

        const { novas, jaAlertadas } = filtrarNaoAlertadas(db, r.publicacoes, 'IBAMA');
        console.log(
          `  Total no periodo: ${r.publicacoes.length} | Novas: ${novas.length} | Ja alertadas: ${jaAlertadas.length}`
        );

        for (const pub of novas) {
          if (pub.classPK) {
            contextoIBAMAPorClassPK[pub.classPK] = {
              cnpj: pub.cnpj,
              empresa: pub.empresaConfig,
            };
          }
        }

        relatorio.ibama[fonteKey] = {
          novas,
          jaAlertadas,
          totalEncontradas: r.publicacoes.length,
        };
      } catch (err) {
        console.error(`  Erro ao consultar IBAMA ${fonteKey}: ${err.message}`);
        relatorio.ibama[fonteKey] = { novas: [], jaAlertadas: [], erro: err.message };
      }
    }
  }

  imprimirRelatorio(relatorio);

  // Salvar relatorio em arquivo JSON (uma linha por data, facil de consultar)
  const nomeArquivo = `relatorio-${hoje.split('-').reverse().join('-')}.json`;
  fs.writeFileSync(nomeArquivo, JSON.stringify(relatorio, null, 2));
  console.log(`\nRelatorio salvo em: ${nomeArquivo}`);

  // Enviar alerta por e-mail se houver publicacoes relevantes.
  // So marcamos como alertadas APOS o envio bem-sucedido — se falhar,
  // a proxima execucao reenvia em vez de perder a notificacao.
  const cfgAlerta = config.alerta || {};
  if (cfgAlerta.ativo) {
    const enviado = await enviarAlerta(relatorio, {
      apiKey: cfgAlerta.resendApiKey,
      de: cfgAlerta.de,
      para: cfgAlerta.para,
    });

    if (enviado) {
      const todasNovas = relatorio.resultados.flatMap((r) => r.relevantes);
      const marcadasDOU = marcarComoAlertadas(db, todasNovas, contextoPorClassPK, 'DOU');
      console.log(`Marcadas como alertadas no banco (DOU): ${marcadasDOU}`);

      for (const fonteKey of Object.keys(relatorio.ibama || {})) {
        const novasIBAMA = relatorio.ibama[fonteKey].novas || [];
        if (novasIBAMA.length === 0) continue;
        const m = marcarComoAlertadas(db, novasIBAMA, contextoIBAMAPorClassPK, 'IBAMA');
        console.log(`Marcadas como alertadas no banco (IBAMA ${fonteKey}): ${m}`);
      }
    }
  }

  db.close();
  return relatorio;
}

// Se chamado diretamente (node monitor.js), executa imediatamente.
// Aceita argumento de data: node monitor.js 15-05-2026
if (require.main === module) {
  const dataArg = process.argv[2] || null;
  executarMonitor(dataArg ? { data: dataArg } : {}).catch(console.error);
}

// config e exportado para que cron.js use a versao mesclada (incluindo config.local.json)
// sem precisar duplicar a logica de merge.
module.exports = { executarMonitor, config };
