// Script de descoberta: abre a busca do DOU e intercepta TODAS as requisicoes
// de rede que a pagina faz, pra ver se existe uma API JSON interna por baixo
// do que e renderizado pelo JavaScript.

const { chromium } = require('playwright');
const fs = require('fs');

const TERMO = 'licença ambiental';
// Removido exactDate=day pra buscar todas as edicoes (nao so a de hoje).
// O DOU nao publica aos fins de semana, entao "hoje" seria vazio num sabado.
const URL = `https://www.in.gov.br/consulta/-/buscar/dou?q=${encodeURIComponent(TERMO)}&s=todos`;

(async () => {
  // headless=true: roda em background, sem abrir janela visivel.
  const browser = await chromium.launch({ headless: true });

  // Contexto realista pra reduzir chance de ser detectado como bot:
  // User-Agent de Chrome no Windows, viewport normal, locale PT-BR.
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'pt-BR',
    extraHTTPHeaders: { 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8' },
  });

  const page = await context.newPage();
  const respostas = [];

  // O "espiao": pra cada response HTTP que o browser recebe, decidir se vale guardar.
  // Tem que ser registrado ANTES do page.goto, senao perdemos as primeiras requisicoes.
  page.on('response', async (res) => {
    const req = res.request();
    const tipo = req.resourceType(); // 'xhr', 'fetch', 'document', 'image', etc.

    // So queremos chamadas dinamicas (API-like). Ignora imagens, CSS, fonts.
    if (tipo !== 'xhr' && tipo !== 'fetch') return;

    const contentType = res.headers()['content-type'] || '';
    let corpo = null;
    try {
      // So lemos o corpo se for JSON ou texto (evita ler binarios enormes)
      if (contentType.includes('json') || contentType.includes('text')) {
        corpo = await res.text();
      }
    } catch (e) {
      corpo = `[erro ao ler corpo: ${e.message}]`;
    }

    respostas.push({
      url: res.url(),
      method: req.method(),
      status: res.status(),
      contentType,
      tipo,
      tamanho: corpo ? corpo.length : 0,
      corpo,
    });
  });

  console.log(`Abrindo: ${URL}\n`);

  try {
    // domcontentloaded e mais rapido que networkidle e nao trava em tracking lento.
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (e) {
    console.log(`Aviso na navegacao: ${e.message}`);
  }

  // Dar tempo pro JavaScript da pagina fazer suas chamadas e renderizar os resultados.
  await page.waitForTimeout(8000);

  // Artefatos pra debug visual e analise posterior
  await page.screenshot({ path: 'dou-debug.png', fullPage: true });
  fs.writeFileSync('dou-rendered.html', await page.content());

  console.log(`Total de respostas XHR/fetch capturadas: ${respostas.length}\n`);

  // Heuristica: o que parece API de busca?
  // - Status 2xx
  // - Content-Type JSON
  // - URL ou corpo mencionam termos relacionados a busca/resultado/licenca
  const candidatos = respostas.filter((r) => {
    if (r.status < 200 || r.status >= 300) return false;
    if (!r.contentType.includes('json')) return false;
    const urlLow = r.url.toLowerCase();
    const corpoLow = (r.corpo || '').toLowerCase();
    return (
      urlLow.includes('search') ||
      urlLow.includes('buscar') ||
      urlLow.includes('consulta') ||
      urlLow.includes('result') ||
      urlLow.includes('solr') ||
      urlLow.includes('match') ||
      urlLow.includes('pesquis') ||
      corpoLow.includes('licença') ||
      corpoLow.includes('licenca') ||
      corpoLow.includes('totalcount') ||
      corpoLow.includes('"hits"') ||
      corpoLow.includes('"items"') ||
      corpoLow.includes('"documents"') ||
      corpoLow.includes('"results"')
    );
  });

  console.log(`Candidatos a API de busca: ${candidatos.length}\n`);
  candidatos.forEach((r, i) => {
    console.log(`--- Candidato ${i + 1} ---`);
    console.log(`${r.method} ${r.status} ${r.url}`);
    console.log(`Content-Type: ${r.contentType}`);
    console.log(`Tamanho: ${r.tamanho} bytes`);
    if (r.corpo) {
      const preview = r.corpo.replace(/\s+/g, ' ').slice(0, 500);
      console.log(`Preview: ${preview}${r.corpo.length > 500 ? '...' : ''}`);
    }
    console.log('');
  });

  // Listar todas pra inspecao manual
  console.log('--- Todas as requisicoes XHR/fetch ---');
  respostas.forEach((r, i) => {
    const ct = (r.contentType.split(';')[0] || '(sem)').trim();
    const url = r.url.length > 110 ? r.url.slice(0, 110) + '...' : r.url;
    const idx = (i + 1).toString().padStart(2);
    console.log(`[${idx}] ${r.method.padEnd(5)} ${r.status} ${ct.padEnd(28)} ${url}`);
  });

  fs.writeFileSync('dou-network.json', JSON.stringify(respostas, null, 2));

  console.log(`\nArtefatos salvos no diretorio do projeto:`);
  console.log(`  - dou-debug.png      (screenshot da pagina)`);
  console.log(`  - dou-rendered.html  (HTML depois do JS rodar)`);
  console.log(`  - dou-network.json   (dump completo das requisicoes)`);

  await browser.close();
})();
