// Modulo de autoteste das fontes — Fase 4, Etapa 3.
//
// Checa conectividade e resposta de cada fonte (DOU, IBAMA, DOESP, Resend) e
// imprime resultado claro por fonte. Nao envia e-mail, nao grava no banco,
// nao gera relatorio — apenas verifica se as fontes estao acessiveis.
//
// Uso direto: node autoteste.js  (ou: npm run autoteste)
// Uso programatico: rodarAutoteste(config) — chamado pelo painel.
//
// Sai com codigo 0 se todas as fontes passaram, 1 se alguma falhou.

const https = require('https');
const { buscarDOU } = require('./dou');
const { buscarDOESP } = require('./diario-estadual');
const { FONTES: FONTES_IBAMA } = require('./ibama');
const { carregarConfig } = require('./config-loader');

// Faz um probe HTTP leve (HEAD) a uma URL. Resolve com { ok: true } se o
// servidor responder 2xx ou 3xx; rejeita com erro descritivo caso contrario.
// Timeout de 15 s para nao travar o autoteste indefinidamente.
function probeHttp(url) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'HEAD' }, (res) => {
      // Drena a resposta para nao vazar a conexao.
      res.resume();
      if (res.statusCode >= 200 && res.statusCode < 400) {
        resolve({ ok: true, status: res.statusCode });
      } else {
        reject(new Error(`HTTP ${res.statusCode}`));
      }
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.end();
  });
}

// Executa todos os probes com dependencias injetaveis.
// opcoes.abrirBrowser  factory que retorna instancia do Playwright
// opcoes.buscarDOU     funcao de busca do DOU (de dou.js)
// opcoes.probeHttp     funcao de probe HTTP (acima)
// opcoes.buscarDOESP   funcao de busca do DOESP (de diario-estadual.js)
// opcoes.resendApiKey  chave da API Resend (string ou null)
//
// Retorna { dou, ibama, doesp, resend }, cada um com { ok: bool, motivo? }.
async function executarProbes(opcoes) {
  const resultados = {};
  let browser = null;

  // --- DOU: abre Chromium, faz uma busca minima (maxPaginas: 1) ---------------
  // PASS = respondeu sem lancar excecao (qualquer contagem, inclusive zero).
  try {
    browser = await opcoes.abrirBrowser();
    const hoje = new Date();
    const dd = String(hoje.getDate()).padStart(2, '0');
    const mm = String(hoje.getMonth() + 1).padStart(2, '0');
    const yyyy = hoje.getFullYear();
    const dataHoje = `${dd}-${mm}-${yyyy}`;
    await opcoes.buscarDOU(browser, 'licenca ambiental', {
      publishFrom: dataHoje,
      publishTo: dataHoje,
      maxPaginas: 1,
    });
    resultados.dou = { ok: true };
  } catch (err) {
    resultados.dou = { ok: false, motivo: err.message };
  } finally {
    if (browser) {
      try { await browser.close(); } catch { /* best-effort */ }
    }
  }

  // --- IBAMA: probe HTTP leve (HEAD) a url de FONTES.autos -------------------
  // Nao baixa o zip inteiro. PASS = a URL respondeu 2xx/3xx.
  try {
    await opcoes.probeHttp(FONTES_IBAMA.autos.url);
    resultados.ibama = { ok: true };
  } catch (err) {
    resultados.ibama = { ok: false, motivo: err.message };
  }

  // --- DOESP: chama buscarDOESP com janela de 1 dia --------------------------
  // PASS = resposta JSON valida sem excecao (qualquer contagem).
  try {
    await opcoes.buscarDOESP('licenca', { diasMaximos: 1, maxPaginas: 1 });
    resultados.doesp = { ok: true };
  } catch (err) {
    resultados.doesp = { ok: false, motivo: err.message };
  }

  // --- Resend: verifica apenas se a chave esta configurada -------------------
  // Nao envia e-mail. PASS = chave presente na config.
  const apiKey = opcoes.resendApiKey;
  if (typeof apiKey === 'string' && apiKey.trim().length > 0) {
    resultados.resend = { ok: true };
  } else {
    resultados.resend = { ok: false, motivo: 'resendApiKey nao configurada em config.local.json' };
  }

  return resultados;
}

// Monta o resultado formatado a partir dos resultados brutos dos probes.
// Funcao PURA e testavel: mesma entrada, mesma saida. Nao acessa rede.
//
// Entrada: { dou, ibama, doesp, resend } — cada um { ok, motivo? }
// Saida:   { linhas: string[], algumFalhou: bool }
function montarResultado(resultados) {
  const fontes = [
    { chave: 'dou', nome: 'DOU' },
    { chave: 'ibama', nome: 'IBAMA' },
    { chave: 'doesp', nome: 'DOESP' },
    { chave: 'resend', nome: 'Resend' },
  ];

  const linhas = [];
  let algumFalhou = false;

  for (const { chave, nome } of fontes) {
    const r = resultados[chave];
    if (!r) continue;
    if (r.ok) {
      linhas.push(`${nome}: OK`);
    } else {
      linhas.push(`${nome}: FALHOU - ${r.motivo || 'erro desconhecido'}`);
      algumFalhou = true;
    }
  }

  return { linhas, algumFalhou };
}

// Executa o autoteste com dependencias reais e retorna o resultado formatado.
// Chamada pelo painel (POST /api/autoteste).
async function rodarAutoteste(config) {
  const { chromium } = require('playwright');
  const cfgAlerta = (config && config.alerta) || {};
  const resultados = await executarProbes({
    abrirBrowser: () => chromium.launch({ headless: true }),
    buscarDOU,
    probeHttp,
    buscarDOESP,
    resendApiKey: cfgAlerta.resendApiKey,
  });
  return montarResultado(resultados);
}

// Ponto de entrada CLI: node autoteste.js  ou  npm run autoteste
if (require.main === module) {
  const config = carregarConfig();
  rodarAutoteste(config)
    .then(({ linhas, algumFalhou }) => {
      for (const linha of linhas) console.log(linha);
      process.exit(algumFalhou ? 1 : 0);
    })
    .catch((err) => {
      console.error('Erro fatal no autoteste:', err.message);
      process.exit(1);
    });
}

module.exports = { executarProbes, montarResultado, probeHttp, rodarAutoteste };
