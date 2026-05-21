// Monitor de Licencas Ambientais — pipeline principal.
// Para cada cliente, e para cada empresa do cliente, busca o CNPJ no DOU
// e nos dados abertos do IBAMA, filtra o que e relevante e gera um relatorio.
// Cada cliente recebe seu proprio e-mail de alerta.

const { chromium } = require('playwright');
const fs = require('fs');
const { buscarDOU, dataDeHoje } = require('./dou');
const { enviarAlerta } = require('./alerta');
const { inicializarDB, filtrarNaoAlertadas, marcarComoAlertadas } = require('./dedup');
const { buscarFonte: buscarFonteIBAMA, normalizarCNPJ } = require('./ibama');
const { carregarConfig } = require('./config-loader');
const logger = require('./log');

const config = carregarConfig();

// Verifica se uma publicacao e relevante para monitoramento ambiental.
// Criterios: o tipo OU o titulo contem palavras do filtro configurado.
// cfg e injetavel para permitir testar a funcao de forma isolada.
function ehRelevante(pub, cfg = config) {
  const tipoLower = pub.tipo.toLowerCase();
  const tituloLower = pub.titulo.toLowerCase();
  const resumoLower = pub.resumo.toLowerCase();

  const { tiposRelevantes, palavrasChaveTitulo } = cfg.filtro;

  const tipoOk = tiposRelevantes.some((t) => tipoLower.includes(t.toLowerCase()));
  const tituloOk = palavrasChaveTitulo.some(
    (p) => tituloLower.includes(p) || resumoLower.includes(p)
  );

  return tipoOk || tituloOk;
}

// Imprime no terminal o relatorio, cliente a cliente.
function imprimirRelatorio(relatorio) {
  const linha = '='.repeat(60);
  console.log(`\n${linha}`);
  console.log(`RELATORIO DO MONITOR DE LICENCAS AMBIENTAIS`);
  console.log(`Data: ${relatorio.data} | Executado em: ${relatorio.executadoEm}`);
  console.log(linha);

  if (!relatorio.clientes || relatorio.clientes.length === 0) {
    console.log('\nNenhum cliente ativo para monitorar.');
    return;
  }

  let totalDOUNovas = 0;
  let totalDOUJa = 0;
  let totalIBAMANovas = 0;
  let totalIBAMAJa = 0;

  for (const cliente of relatorio.clientes) {
    console.log(`\n${'#'.repeat(60)}`);
    console.log(`CLIENTE: ${cliente.clienteNome}`);
    console.log('#'.repeat(60));

    if (cliente.resultados.length === 0) {
      console.log('  Nenhuma empresa ativa para este cliente.');
    }

    for (const res of cliente.resultados) {
      console.log(`\n--- ${res.empresa} (${res.cnpj}) ---`);

      if (res.erro) {
        console.log(`  ERRO na busca: ${res.erro}`);
        continue;
      }

      const jaN = (res.jaAlertadas || []).length;
      totalDOUJa += jaN;
      console.log(
        `Publicacoes encontradas: ${res.totalEncontradas} | Novas: ${res.relevantes.length} | Ja alertadas: ${jaN}`
      );

      if (res.relevantes.length === 0) {
        console.log('  Nenhuma publicacao nova hoje.');
        continue;
      }

      totalDOUNovas += res.relevantes.length;
      res.relevantes.forEach((pub, i) => {
        console.log(`\n  [${i + 1}] ${pub.tipo} — ${pub.data}`);
        console.log(`  Orgao:  ${pub.orgaoStr}`);
        console.log(`  Titulo: ${pub.titulo}`);
        console.log(`  Link:   ${pub.link}`);
        console.log(`  Resumo: ${pub.resumo.slice(0, 200)}...`);
      });
    }

    for (const [fonteKey, dados] of Object.entries(cliente.ibama || {})) {
      console.log(`\n--- IBAMA: ${fonteKey} ---`);
      if (dados.erro) {
        console.log(`  Erro: ${dados.erro}`);
        continue;
      }
      const novasN = (dados.novas || []).length;
      const jaN = (dados.jaAlertadas || []).length;
      totalIBAMANovas += novasN;
      totalIBAMAJa += jaN;
      console.log(
        `Total no periodo: ${dados.totalEncontradas} | Novas: ${novasN} | Ja alertadas: ${jaN}`
      );

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
  console.log(`DOU — novos: ${totalDOUNovas} | ja alertados: ${totalDOUJa}`);
  console.log(`IBAMA — novos: ${totalIBAMANovas} | ja alertados: ${totalIBAMAJa}`);
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

// Processa o DOU de um cliente: uma busca por empresa ativa. Devolve a lista
// de resultados e preenche contextoDOU (classPK -> { cnpj, empresa }), usado
// depois para enriquecer as marcacoes no banco.
async function processarDOUDoCliente(browser, empresasAtivas, hoje, db, clienteId, contextoDOU) {
  const resultados = [];

  for (const empresa of empresasAtivas) {
    console.log(`\nBuscando: ${empresa.nome} (${empresa.cnpj})...`);

    // Aspas forcam correspondencia exata da frase completa.
    // Sem aspas, o portal tokeniza o CNPJ e retorna falsos positivos.
    const termoBusca = `"${empresa.cnpj}"`;

    // Uma falha na busca de uma empresa nao pode derrubar as demais: o erro
    // e registrado no resultado e a execucao continua.
    let resultado;
    try {
      resultado = await buscarDOU(browser, termoBusca, {
        publishFrom: hoje,
        publishTo: hoje,
      });
    } catch (err) {
      console.error(`  Erro ao buscar ${empresa.nome} no DOU: ${err.message}`);
      resultados.push({
        empresa: empresa.nome,
        cnpj: empresa.cnpj,
        totalEncontradas: 0,
        relevantes: [],
        jaAlertadas: [],
        todas: [],
        erro: err.message,
      });
      continue;
    }

    const relevantesTodos = resultado.publicacoes.filter((pub) => ehRelevante(pub));
    const { novas, jaAlertadas } = filtrarNaoAlertadas(db, relevantesTodos, 'DOU', clienteId);

    for (const pub of novas) {
      if (pub.classPK) {
        contextoDOU[pub.classPK] = { cnpj: empresa.cnpj, empresa: empresa.nome };
      }
    }

    console.log(
      `  Encontradas: ${resultado.publicacoes.length} | Relevantes: ${relevantesTodos.length} | Ja alertadas: ${jaAlertadas.length} | Novas: ${novas.length}`
    );

    resultados.push({
      empresa: empresa.nome,
      cnpj: empresa.cnpj,
      totalEncontradas: resultado.publicacoes.length,
      relevantes: novas,
      jaAlertadas,
      todas: resultado.publicacoes,
    });
  }

  return resultados;
}

// Processa o IBAMA de um cliente: para cada fonte configurada, busca as
// publicacoes das empresas do cliente. Cada fonte tem seu try/catch — um erro
// numa fonte nao derruba as outras nem o DOU.
async function processarIBAMADoCliente(empresasAtivas, db, clienteId, contextoIBAMA) {
  const cfgIbama = config.ibama || {};
  const ibamaPorFonte = {};

  const ativo =
    cfgIbama.ativo && Array.isArray(cfgIbama.fontes) && cfgIbama.fontes.length > 0;
  if (!ativo || empresasAtivas.length === 0) return ibamaPorFonte;

  const cnpjsCliente = empresasAtivas.map((e) => e.cnpj);
  const cnpjParaEmpresa = {};
  for (const e of empresasAtivas) {
    cnpjParaEmpresa[normalizarCNPJ(e.cnpj)] = e;
  }

  for (const fonteKey of cfgIbama.fontes) {
    console.log(`\n  Consultando IBAMA: ${fonteKey}...`);
    try {
      const r = await buscarFonteIBAMA(fonteKey, cnpjsCliente, {
        diasMaximos: cfgIbama.diasMaximos || 30,
      });

      // Atribui a empresa do config com base no CNPJ que casou.
      for (const pub of r.publicacoes) {
        const e = cnpjParaEmpresa[normalizarCNPJ(pub.cnpj)];
        pub.empresaConfig = e ? e.nome : '(CNPJ desconhecido)';
      }

      const { novas, jaAlertadas } = filtrarNaoAlertadas(db, r.publicacoes, 'IBAMA', clienteId);

      for (const pub of novas) {
        if (pub.classPK) {
          contextoIBAMA[pub.classPK] = { cnpj: pub.cnpj, empresa: pub.empresaConfig };
        }
      }

      console.log(
        `  [IBAMA ${fonteKey}] Total: ${r.publicacoes.length} | Novas: ${novas.length} | Ja alertadas: ${jaAlertadas.length}`
      );

      ibamaPorFonte[fonteKey] = {
        novas,
        jaAlertadas,
        totalEncontradas: r.publicacoes.length,
      };
    } catch (err) {
      console.error(`  Erro ao consultar IBAMA ${fonteKey}: ${err.message}`);
      ibamaPorFonte[fonteKey] = { novas: [], jaAlertadas: [], erro: err.message };
    }
  }

  return ibamaPorFonte;
}

async function executarMonitorInterno(opcoes, arquivoLog) {
  const hoje = opcoes.data || dataDeHoje();

  if (!hoje) {
    console.log('Hoje e fim de semana. O DOU nao publica aos sabados e domingos. Nada a fazer.');
    return null;
  }

  const clientesAtivos = config.clientes.filter((c) => c.ativo);

  console.log(`\nIniciando monitoramento para ${hoje}...`);
  console.log(`Clientes ativos: ${clientesAtivos.length}`);
  console.log(`Log desta execucao: ${arquivoLog}`);

  const browser = await chromium.launch({ headless: true });
  const db = inicializarDB();

  const relatorio = {
    data: hoje,
    executadoEm: new Date().toISOString(),
    clientes: [],
  };

  // clienteId -> { dou, ibama } com os mapas classPK -> { cnpj, empresa }.
  // Usado depois do envio para enriquecer as marcacoes no banco.
  const contextoPorCliente = {};

  for (const cliente of clientesAtivos) {
    const empresasAtivas = (cliente.empresas || []).filter((e) => e.ativa);
    console.log(
      `\n=== Cliente: ${cliente.nome} (${empresasAtivas.length} empresa(s) ativa(s)) ===`
    );

    const contextoDOU = {};
    const contextoIBAMA = {};

    const resultados = await processarDOUDoCliente(
      browser,
      empresasAtivas,
      hoje,
      db,
      cliente.id,
      contextoDOU
    );
    const ibama = await processarIBAMADoCliente(empresasAtivas, db, cliente.id, contextoIBAMA);

    relatorio.clientes.push({
      clienteId: cliente.id,
      clienteNome: cliente.nome,
      resultados,
      ibama,
    });
    contextoPorCliente[cliente.id] = { dou: contextoDOU, ibama: contextoIBAMA };
  }

  await browser.close();

  imprimirRelatorio(relatorio);

  // Salvar relatorio em arquivo JSON (nome em data ISO, ordenavel).
  const nomeArquivo = `relatorio-${hoje.split('-').reverse().join('-')}.json`;
  fs.writeFileSync(nomeArquivo, JSON.stringify(relatorio, null, 2));
  console.log(`\nRelatorio salvo em: ${nomeArquivo}`);

  // Enviar um e-mail por cliente. So marcamos como alertadas APOS o envio
  // bem-sucedido — se falhar, a proxima execucao reenvia.
  const cfgAlerta = config.alerta || {};
  if (cfgAlerta.ativo) {
    for (const bloco of relatorio.clientes) {
      const cliente = clientesAtivos.find((c) => c.id === bloco.clienteId);
      const para =
        cliente && cliente.alerta && Array.isArray(cliente.alerta.para)
          ? cliente.alerta.para
          : [];

      if (para.length === 0) {
        console.log(`Cliente "${bloco.clienteNome}" sem destinatarios — e-mail pulado.`);
        continue;
      }

      const enviado = await enviarAlerta(
        {
          data: relatorio.data,
          executadoEm: relatorio.executadoEm,
          clienteNome: bloco.clienteNome,
          resultados: bloco.resultados,
          ibama: bloco.ibama,
        },
        { apiKey: cfgAlerta.resendApiKey, de: cfgAlerta.de, para }
      );

      if (enviado) {
        const ctx = contextoPorCliente[bloco.clienteId] || { dou: {}, ibama: {} };

        const novasDOU = bloco.resultados.flatMap((r) => r.relevantes);
        const marcadasDOU = marcarComoAlertadas(db, novasDOU, ctx.dou, 'DOU', bloco.clienteId);
        console.log(`  [${bloco.clienteNome}] marcadas no banco (DOU): ${marcadasDOU}`);

        for (const fonteKey of Object.keys(bloco.ibama || {})) {
          const novasIBAMA = bloco.ibama[fonteKey].novas || [];
          if (novasIBAMA.length === 0) continue;
          const m = marcarComoAlertadas(db, novasIBAMA, ctx.ibama, 'IBAMA', bloco.clienteId);
          console.log(`  [${bloco.clienteNome}] marcadas no banco (IBAMA ${fonteKey}): ${m}`);
        }
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

module.exports = { executarMonitor, ehRelevante };
