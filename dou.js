// Modulo de busca do DOU — funcao reutilizavel por outros scripts.
// Recebe um termo e opcoes, devolve array de publicacoes estruturadas.

const { chromium } = require('playwright');

const BASE_URL = 'https://www.in.gov.br/consulta/-/buscar/dou';

// Remove tags HTML do texto dos resumos
function limparHTML(str) {
  return (str || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

// Monta a data de hoje no formato dd-MM-yyyy que o portal aceita.
// Retorna null se for fim de semana (DOU nao publica sabado/domingo).
function dataDeHoje() {
  const hoje = new Date();
  const dia = hoje.getDay(); // 0=dom, 6=sab
  if (dia === 0 || dia === 6) return null;
  return hoje.toLocaleDateString('pt-BR').split('/').join('-');
}

// Extrai as publicacoes e os dados de paginacao da pagina atual.
async function extrairPagina(page) {
  try {
    await page.waitForFunction(
      () => {
        const el = document.querySelector('.search-total-label');
        return el && el.textContent.trim().length > 0;
      },
      { timeout: 25000 }
    );
  } catch (e) {
    return null;
  }

  const totalText = await page
    .$eval('.search-total-label', (el) => el.textContent.trim())
    .catch(() => '');

  if (totalText.startsWith('0 ')) {
    return { publicacoes: [], totalPages: 0, totalResultados: totalText };
  }

  // Dados em JSON embarcado — mais ricos e confiaveis que parsear HTML
  const jsonData = await page
    .$eval('#_br_com_seatecnologia_in_buscadou_BuscaDouPortlet_params', (el) =>
      JSON.parse(el.innerHTML)
    )
    .catch(() => ({ jsonArray: [] }));

  const info = await page
    .evaluate(() => {
      if (typeof request === 'undefined') return {};
      return {
        totalPages: request.totalPages,
        currentPage: request.currentPage,
        exactDate: request.exactDate,
        publishFrom: request.publishFrom,
        publishTo: request.publishTo,
        delta: request.delta,
        sortType: request.sortType,
      };
    })
    .catch(() => ({ totalPages: 1, currentPage: 1 }));

  return { publicacoes: jsonData.jsonArray || [], totalResultados: totalText, ...info };
}

// Constroi a URL da proxima pagina usando o cursor do ultimo item.
function buildProximaPaginaUrl(termo, result, nextPage) {
  const ultimo = result.publicacoes[result.publicacoes.length - 1];
  const params = {
    q: termo,
    s: 'todos',
    exactDate: result.exactDate || 'personalizado',
    sortType: result.sortType || '0',
    delta: result.delta || 75,
    currentPage: result.currentPage,
    newPage: nextPage,
    score: ultimo.score,
    id: ultimo.classPK,
    displayDate: ultimo.displayDateSortable,
  };
  if (result.exactDate === 'personalizado') {
    params.publishFrom = result.publishFrom;
    params.publishTo = result.publishTo;
  }
  return `${BASE_URL}?${new URLSearchParams(params)}`;
}

// Funcao principal: busca um termo no DOU e devolve publicacoes estruturadas.
// browser: instancia do Playwright (passada de fora pra reutilizar entre buscas)
// termo: string a buscar (ex: CNPJ, nome da empresa, termo ambiental)
// opcoes.publishFrom/publishTo: data no formato dd-MM-yyyy
// opcoes.delta: itens por pagina (max 75)
// opcoes.maxPaginas: limite de paginas (padrao 3)
async function buscarDOU(browser, termo, opcoes = {}) {
  const {
    publishFrom = null,
    publishTo = null,
    delta = 75,
    maxPaginas = 3,
  } = opcoes;

  const params = {
    q: termo,
    s: 'todos',
    exactDate: 'personalizado',
    delta,
    publishFrom: publishFrom || dataDeHoje() || '',
    publishTo: publishTo || dataDeHoje() || '',
  };

  const url1 = `${BASE_URL}?${new URLSearchParams(params)}`;
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'pt-BR',
    extraHTTPHeaders: { 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8' },
  });
  const page = await context.newPage();

  await page.goto(url1, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  let resultadoAtual = await extrairPagina(page);

  if (!resultadoAtual || resultadoAtual.publicacoes.length === 0) {
    await context.close();
    return { publicacoes: [], totalResultados: resultadoAtual?.totalResultados || '0' };
  }

  const todasPublicacoes = [...resultadoAtual.publicacoes];
  let paginaAtual = 1;

  while (paginaAtual < Math.min(resultadoAtual.totalPages, maxPaginas)) {
    const proxPag = paginaAtual + 1;
    const urlProx = buildProximaPaginaUrl(termo, resultadoAtual, proxPag);
    await page.goto(urlProx, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    const res = await extrairPagina(page);
    if (!res || res.publicacoes.length === 0) break;
    todasPublicacoes.push(...res.publicacoes);
    resultadoAtual = res;
    paginaAtual = proxPag;
  }

  await context.close();

  // Normalizar dados antes de retornar
  return {
    totalResultados: resultadoAtual.totalResultados,
    publicacoes: todasPublicacoes.map((pub) => ({
      tipo: pub.artType || '',
      secao: pub.pubName || '',
      orgaos: pub.hierarchyList || [],
      orgaoStr: pub.hierarchyStr || '',
      edicao: pub.editionNumber || '',
      pagina: pub.numberPage || '',
      titulo: pub.title || '',
      data: pub.pubDate || '',
      link: `https://www.in.gov.br/web/dou/-/${pub.urlTitle}`,
      resumo: limparHTML(pub.content),
      classPK: pub.classPK || '',
    })),
  };
}

module.exports = { buscarDOU, dataDeHoje, limparHTML };
