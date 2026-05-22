// Monitor de Licencas Ambientais — pipeline principal.
// Para cada cliente, e para cada empresa do cliente, busca o CNPJ no DOU
// e nos dados abertos do IBAMA, filtra o que e relevante e gera um relatorio.
// Cada cliente recebe seu proprio e-mail de alerta.

const { chromium } = require('playwright');
const fs = require('fs');
const { buscarDOU, dataDeHoje } = require('./dou');
const { enviarAlerta, enviarAlertaDeFalha, enviarAlertaDeFalhaFatal } = require('./alerta');
const { inicializarDB, filtrarNaoAlertadas, marcarComoAlertadas } = require('./dedup');
const { buscarFonte: buscarFonteIBAMA, normalizarCNPJ } = require('./ibama');
const { DIARIOS, ufsParaVarrer } = require('./diario-estadual');
const { carregarConfig } = require('./config-loader');
const { calcularSaude } = require('./saude');
const logger = require('./log');
const { limparLogsAntigos } = require('./log');

// Verifica se uma publicacao e relevante para monitoramento ambiental.
// Criterios: o tipo OU o titulo contem palavras do filtro configurado.
// cfg e injetavel para permitir testar a funcao de forma isolada.
function ehRelevante(pub, cfg) {
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
  let totalDOUICMBio = 0;
  let totalIBAMANovas = 0;
  let totalIBAMAJa = 0;
  let totalDiariosNovas = 0;
  let totalDiariosJa = 0;

  for (const cliente of relatorio.clientes) {
    console.log(`\n${'#'.repeat(60)}`);
    console.log(`CLIENTE: ${cliente.clienteNome}`);
    console.log('#'.repeat(60));

    if (cliente.erro) {
      console.log(`  ERRO ao processar este cliente: ${cliente.erro}`);
      continue;
    }

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
        // Publicacoes do ICMBio (orgaoCategoria) ganham um selo destacado.
        const ehICMBio = pub.orgaoCategoria === 'ICMBio';
        if (ehICMBio) totalDOUICMBio += 1;
        const selo = ehICMBio ? ' [ICMBio]' : '';
        console.log(`\n  [${i + 1}] ${pub.tipo} — ${pub.data}${selo}`);
        console.log(`  Orgao:  ${pub.orgaoStr}`);
        if (ehICMBio) console.log(`  Categoria: ICMBio`);
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

    for (const [uf, dados] of Object.entries(cliente.diariosEstaduais || {})) {
      console.log(`\n--- Diario Estadual: ${dados.nome || uf} ---`);
      if (dados.erro) {
        console.log(`  Erro: ${dados.erro}`);
        continue;
      }
      const novasN = (dados.novas || []).length;
      const jaN = (dados.jaAlertadas || []).length;
      totalDiariosNovas += novasN;
      totalDiariosJa += jaN;
      console.log(
        `Total no periodo: ${dados.totalEncontradas} | Novas: ${novasN} | Ja alertadas: ${jaN}`
      );

      (dados.novas || []).forEach((pub, i) => {
        console.log(`\n  [${i + 1}] ${pub.tipo} — ${pub.data}`);
        console.log(`  Empresa: ${pub.empresaConfig || ''} (${pub.cnpj || ''})`);
        console.log(`  Titulo:  ${pub.titulo}`);
        console.log(`  Orgao:   ${pub.orgaoStr}`);
        console.log(`  Link:    ${pub.link}`);
        console.log(`  Resumo:  ${(pub.resumo || '').slice(0, 200)}...`);
      });
    }
  }

  console.log(`\n${linha}`);
  console.log(
    `DOU — novos: ${totalDOUNovas} | ja alertados: ${totalDOUJa} | categoria ICMBio: ${totalDOUICMBio}`
  );
  console.log(`IBAMA — novos: ${totalIBAMANovas} | ja alertados: ${totalIBAMAJa}`);
  console.log(
    `Diarios estaduais — novos: ${totalDiariosNovas} | ja alertados: ${totalDiariosJa}`
  );
  console.log(linha);
}

// Resolve o destino do aviso ao operador a partir da config. Centraliza o
// fallback gracioso: se alerta.operador estiver ausente/vazio, devolve [].
function destinatariosOperador(config) {
  const cfgAlerta = (config && config.alerta) || {};
  return Array.isArray(cfgAlerta.operador) ? cfgAlerta.operador : [];
}

async function executarMonitor(opcoes = {}) {
  const arquivoLog = logger.iniciar();

  // Limpeza de logs antigos — best-effort, nao derruba o monitor se falhar.
  try {
    const cfg = opcoes.config || carregarConfig();
    const diasReter = cfg.manutencao && cfg.manutencao.logsDiasReter;
    limparLogsAntigos(diasReter);
  } catch {
    // carregarConfig pode falhar antes do erro fatal abaixo — ignora aqui.
  }

  try {
    return await executarMonitorInterno(opcoes, arquivoLog);
  } catch (err) {
    // Garante que o erro va para o log antes de fechar o stream.
    console.error('Erro fatal no monitor:', err);

    // Falha fatal: o monitor nem produziu o relatorio. Antes de relancar,
    // TENTA avisar o operador (best-effort) — se a propria falha for falta de
    // internet, o e-mail nao sai e tudo bem, o erro ja esta no log. O envio
    // jamais pode mascarar a excecao original: ela e sempre relancada para a
    // Etapa 2 poder sair com codigo 1.
    try {
      // A config pode nao ter sido carregada (a falha pode ter sido a propria
      // leitura da config); por isso a carga vai num try/catch proprio.
      let config = opcoes.config;
      if (!config) {
        config = carregarConfig();
      }
      const cfgAlerta = config.alerta || {};
      await enviarAlertaDeFalhaFatal(err, {
        apiKey: cfgAlerta.resendApiKey,
        de: cfgAlerta.de,
        para: destinatariosOperador(config),
        data: opcoes.data || dataDeHoje() || new Date().toISOString().slice(0, 10),
      });
    } catch (errAviso) {
      console.error('Nao foi possivel avisar o operador da falha fatal:', errAviso.message);
    }

    throw err;
  } finally {
    logger.fechar();
  }
}

// Processa o DOU de um cliente: uma busca por empresa ativa. Devolve a lista
// de resultados e preenche contextoDOU (classPK -> { cnpj, empresa }), usado
// depois para enriquecer as marcacoes no banco.
async function processarDOUDoCliente(browser, empresasAtivas, hoje, db, clienteId, contextoDOU, config) {
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

    const relevantesTodos = resultado.publicacoes.filter((pub) => ehRelevante(pub, config));
    const { novas, jaAlertadas } = filtrarNaoAlertadas(db, relevantesTodos, 'DOU', clienteId);

    for (const pub of novas) {
      if (pub.classPK) {
        contextoDOU[pub.classPK] = { cnpj: empresa.cnpj, empresa: empresa.nome };
      }
    }

    console.log(
      `  Encontradas: ${resultado.publicacoes.length} | Relevantes: ${relevantesTodos.length} | Ja alertadas: ${jaAlertadas.length} | Novas: ${novas.length}`
    );

    // Propaga a sinalizacao de DOU parcial (perda de paginas). buscarDOU so
    // inclui esses campos quando houve perda; o auto-diagnostico (saude) os
    // usa para distinguir "busca incompleta" de "busca vazia".
    const bloco = {
      empresa: empresa.nome,
      cnpj: empresa.cnpj,
      totalEncontradas: resultado.publicacoes.length,
      relevantes: novas,
      jaAlertadas,
      todas: resultado.publicacoes,
    };
    if (resultado.parcial) {
      bloco.parcial = true;
      bloco.aviso = resultado.aviso;
    }
    resultados.push(bloco);
  }

  return resultados;
}

// Processa o IBAMA de um cliente: para cada fonte configurada, busca as
// publicacoes das empresas do cliente. Cada fonte tem seu try/catch — um erro
// numa fonte nao derruba as outras nem o DOU.
async function processarIBAMADoCliente(empresasAtivas, db, clienteId, contextoIBAMA, config) {
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

// Processa os diarios estaduais de um cliente. Resolve as UFs a varrer (uniao
// do campo `uf` das empresas, com override pela config) e, para cada UF com
// diario implementado no registry, busca o CNPJ de cada empresa. UF sem
// implementacao e pulada com aviso, sem erro. Cada UF tem seu try/catch — um
// erro numa UF nao derruba as demais nem o resto do pipeline (padrao IBAMA).
async function processarDiariosDoCliente(browser, empresasAtivas, db, clienteId, contextoDiarios, config) {
  const cfg = config.diariosEstaduais || {};
  const diariosPorUF = {};

  if (cfg.ativo !== true || empresasAtivas.length === 0) return diariosPorUF;

  const ufs = ufsParaVarrer(empresasAtivas, cfg.estados);
  if (ufs.length === 0) return diariosPorUF;

  for (const uf of ufs) {
    const diario = DIARIOS[uf];
    if (!diario) {
      console.warn(`  Diario estadual de ${uf} nao implementado — pulando (sem erro).`);
      continue;
    }

    console.log(`\n  Consultando diario estadual: ${diario.nome} (${uf})...`);
    try {
      let todas = [];
      for (const empresa of empresasAtivas) {
        const r = await diario.buscar(browser, empresa.cnpj, {
          diasMaximos: cfg.diasMaximos || 7,
        });
        // Associa cada publicacao a empresa do config que originou a busca.
        for (const pub of r.publicacoes) {
          pub.empresaConfig = empresa.nome;
          pub.cnpj = empresa.cnpj;
        }
        todas = todas.concat(r.publicacoes);
      }

      const { novas, jaAlertadas } = filtrarNaoAlertadas(db, todas, diario.fonte, clienteId);

      for (const pub of novas) {
        if (pub.classPK) {
          contextoDiarios[pub.classPK] = { cnpj: pub.cnpj, empresa: pub.empresaConfig };
        }
      }

      console.log(
        `  [${diario.fonte}] Total: ${todas.length} | Novas: ${novas.length} | Ja alertadas: ${jaAlertadas.length}`
      );

      diariosPorUF[uf] = {
        fonte: diario.fonte,
        nome: diario.nome,
        novas,
        jaAlertadas,
        totalEncontradas: todas.length,
      };
    } catch (err) {
      console.error(`  Erro ao consultar diario estadual de ${uf}: ${err.message}`);
      diariosPorUF[uf] = {
        fonte: diario.fonte,
        nome: diario.nome,
        novas: [],
        jaAlertadas: [],
        erro: err.message,
      };
    }
  }

  return diariosPorUF;
}

// Verifica se uma data no formato DD-MM-YYYY e fim de semana.
// Usado para rejeitar datas explicitamente passadas na CLI que caiam no sabado
// ou domingo — o DOU nao publica nesses dias.
function ehFimDeSemana(data) {
  if (typeof data !== 'string') return false;
  const partes = data.split('-');
  if (partes.length !== 3) return false;
  const d = new Date(Number(partes[2]), Number(partes[1]) - 1, Number(partes[0]));
  const dia = d.getDay();
  return dia === 0 || dia === 6;
}

async function executarMonitorInterno(opcoes, arquivoLog) {
  const config = opcoes.config || carregarConfig();
  const hoje = opcoes.data || dataDeHoje();

  if (!hoje || ehFimDeSemana(hoje)) {
    console.log('Hoje e fim de semana. O DOU nao publica aos sabados e domingos. Nada a fazer.');
    return null;
  }

  const clientesAtivos = config.clientes.filter((c) => c.ativo);

  console.log(`\nIniciando monitoramento para ${hoje}...`);
  console.log(`Clientes ativos: ${clientesAtivos.length}`);
  console.log(`Log desta execucao: ${arquivoLog}`);

  const browser = await chromium.launch({ headless: true });
  const db = inicializarDB();

  try {
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

      // Uma falha ao processar um cliente nao pode derrubar os demais: o erro
      // e registrado no bloco do cliente e o laco segue para o proximo.
      try {
        const contextoDOU = {};
        const contextoIBAMA = {};
        const contextoDiarios = {};

        const resultados = await processarDOUDoCliente(
          browser,
          empresasAtivas,
          hoje,
          db,
          cliente.id,
          contextoDOU,
          config
        );
        const ibama = await processarIBAMADoCliente(empresasAtivas, db, cliente.id, contextoIBAMA, config);
        const diariosEstaduais = await processarDiariosDoCliente(
          browser,
          empresasAtivas,
          db,
          cliente.id,
          contextoDiarios,
          config
        );

        relatorio.clientes.push({
          clienteId: cliente.id,
          clienteNome: cliente.nome,
          resultados,
          ibama,
          diariosEstaduais,
        });
        contextoPorCliente[cliente.id] = {
          dou: contextoDOU,
          ibama: contextoIBAMA,
          diarios: contextoDiarios,
        };
      } catch (err) {
        console.error(`Erro ao processar o cliente "${cliente.nome}": ${err.message}`);
        relatorio.clientes.push({
          clienteId: cliente.id,
          clienteNome: cliente.nome,
          resultados: [],
          ibama: {},
          diariosEstaduais: {},
          erro: err.message,
        });
      }
    }

    // Auto-diagnostico: agrega os campos `erro` ja espalhados pelo relatorio
    // num resumo de saude (status geral + contagem por fonte + lista de
    // falhas). E um campo ADICIONAL no topo do relatorio — relatorios antigos
    // sem `saude` continuam validos.
    relatorio.saude = calcularSaude(relatorio);
    if (relatorio.saude.status === 'ok') {
      console.log('\nSaude da execucao: ok — todas as fontes responderam.');
    } else {
      console.warn(
        `\nSaude da execucao: parcial — ${relatorio.saude.falhas.length} falha(s) detectada(s).`
      );
      for (const f of relatorio.saude.falhas) {
        console.warn(`  - ${f}`);
      }
    }

    imprimirRelatorio(relatorio);

    // Salvar relatorio em arquivo JSON (nome em data ISO, ordenavel).
    const nomeArquivo = `relatorio-${hoje.split('-').reverse().join('-')}.json`;
    try {
      fs.writeFileSync(nomeArquivo, JSON.stringify(relatorio, null, 2));
      console.log(`\nRelatorio salvo em: ${nomeArquivo}`);
    } catch (err) {
      console.error(`Erro ao salvar relatorio: ${err.message}`);
      throw err;
    }

    // Aviso ao operador: se a execucao teve problemas, envia UM e-mail ao
    // operador (config.alerta.operador) com a lista de falhas. E separado do
    // e-mail aos clientes (enviarAlerta) e nao deve derrubar a execucao —
    // por isso vai num try/catch proprio.
    if (relatorio.saude.status !== 'ok') {
      try {
        const cfgAlerta = config.alerta || {};
        await enviarAlertaDeFalha(relatorio.saude, {
          apiKey: cfgAlerta.resendApiKey,
          de: cfgAlerta.de,
          para: destinatariosOperador(config),
          data: relatorio.data,
        });
      } catch (err) {
        console.error(`Erro ao avisar o operador sobre a execucao parcial: ${err.message}`);
      }
    }

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
            diariosEstaduais: bloco.diariosEstaduais,
          },
          { apiKey: cfgAlerta.resendApiKey, de: cfgAlerta.de, para }
        );

        if (enviado) {
          const ctx = contextoPorCliente[bloco.clienteId] || { dou: {}, ibama: {}, diarios: {} };

          const novasDOU = bloco.resultados.flatMap((r) => r.relevantes);
          const marcadasDOU = marcarComoAlertadas(db, novasDOU, ctx.dou, 'DOU', bloco.clienteId);
          console.log(`  [${bloco.clienteNome}] marcadas no banco (DOU): ${marcadasDOU}`);

          for (const fonteKey of Object.keys(bloco.ibama || {})) {
            const novasIBAMA = bloco.ibama[fonteKey].novas || [];
            if (novasIBAMA.length === 0) continue;
            const m = marcarComoAlertadas(db, novasIBAMA, ctx.ibama, 'IBAMA', bloco.clienteId);
            console.log(`  [${bloco.clienteNome}] marcadas no banco (IBAMA ${fonteKey}): ${m}`);
          }

          // Diarios estaduais: marca por fonte (ex: 'DOESP') apos o envio.
          for (const uf of Object.keys(bloco.diariosEstaduais || {})) {
            const dadosUF = bloco.diariosEstaduais[uf];
            const novasDiario = dadosUF.novas || [];
            if (novasDiario.length === 0) continue;
            const m = marcarComoAlertadas(
              db,
              novasDiario,
              ctx.diarios,
              dadosUF.fonte,
              bloco.clienteId
            );
            console.log(`  [${bloco.clienteNome}] marcadas no banco (diario ${uf}): ${m}`);
          }
        }
      }
    }

    return relatorio;
  } finally {
    await browser.close();
    db.close();
  }
}

// Se chamado diretamente (node monitor.js), executa imediatamente.
// Aceita argumento de data: node monitor.js 15-05-2026
// Sai com codigo 0 em sucesso (inclusive fim de semana) e 1 em falha fatal,
// para que o Agendador do Windows possa detectar falhas automaticamente.
if (require.main === module) {
  const dataArg = process.argv[2] || null;
  executarMonitor(dataArg ? { data: dataArg } : {})
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { executarMonitor, ehRelevante };
