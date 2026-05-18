// Extrator do DOU — versao final.
// Le dados do bloco JSON embarcado na pagina (mais rico que parsear HTML)
// e pagina automaticamente usando o mecanismo de cursor do portal.

const { chromium } = require('playwright');
const fs = require('fs');

// --- Configuracao ---
const TERMO = 'licença ambiental';

// Opcoes de filtro de data:
//   'dia'          => edicao do dia (usar em producao, so em dias uteis)
//   'semana'       => ultimos 7 dias
//   'mes'          => ultimo mes
//   'personalizado' => usar com PUBLISH_FROM e PUBLISH_TO abaixo
//   'all'          => arquivo completo (sem filtro)
const EXACT_DATE = 'personalizado'; // 'dia' em producao; 'personalizado' pra testar com data conhecida
const PUBLISH_FROM = '15-05-2026';  // quinta-feira: sabemos que tem DOU
const PUBLISH_TO   = '16-05-2026';  // sexta-feira

const DELTA = 75;      // itens por pagina (max = 75)
const MAX_PAGINAS = 5; // limite de seguranca para nao buscar infinitamente
// --- fim da configuracao ---

const BASE_URL = 'https://www.in.gov.br/consulta/-/buscar/dou';

function buildUrl(params) {
  return `${BASE_URL}?${new URLSearchParams(params)}`;
}

// Remove tags HTML (<span class="highlight">, etc.) e espacos extras do texto
function limparHTML(str) {
  return (str || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

// Extrai os dados da pagina atual: publicacoes (JSON) + info de paginacao (objeto JS)
async function extrairDadosDaPagina(page) {
  // Aguarda o texto do contador aparecer (nao so o elemento, mas o conteudo)
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

  // Os resultados ja estao em JSON dentro de um <script type="application/json">
  // O JS da pagina le daqui para renderizar a lista — nos lemos na fonte.
  const jsonData = await page
    .$eval('#_br_com_seatecnologia_in_buscadou_BuscaDouPortlet_params', (el) =>
      JSON.parse(el.innerHTML)
    )
    .catch(() => ({ jsonArray: [] }));

  // Lemos o objeto JS 'request' que o portal usa para paginacao
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

  return {
    publicacoes: jsonData.jsonArray || [],
    totalResultados: totalText,
    ...info,
  };
}

// Monta a URL da proxima pagina usando o cursor do ultimo item da pagina atual.
// O portal usa paginacao por cursor (score + classPK + displayDateSortable),
// nao por numero de pagina simples.
function buildProximaPaginaUrl(termo, result, nextPage) {
  const ultimo = result.publicacoes[result.publicacoes.length - 1];
  const params = {
    q: termo,
    s: 'todos',
    exactDate: result.exactDate || 'all',
    sortType: result.sortType || '0',
    delta: result.delta || 20,
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
  return buildUrl(params);
}

(async () => {
  const url1 = buildUrl({
    q: TERMO,
    s: 'todos',
    exactDate: EXACT_DATE,
    delta: DELTA,
    ...(EXACT_DATE === 'personalizado' && { publishFrom: PUBLISH_FROM, publishTo: PUBLISH_TO }),
  });

  console.log(`Termo: "${TERMO}"`);
  console.log(`Filtro de data: ${EXACT_DATE}`);
  console.log(`Delta (itens/pagina): ${DELTA} | Max paginas: ${MAX_PAGINAS}`);
  console.log(`URL: ${url1}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'pt-BR',
    extraHTTPHeaders: { 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8' },
  });
  const page = await context.newPage();

  await page
    .goto(url1, { waitUntil: 'domcontentloaded', timeout: 60000 })
    .catch((e) => console.log(`Aviso ao navegar: ${e.message}`));

  const resultado1 = await extrairDadosDaPagina(page);

  if (!resultado1 || resultado1.publicacoes.length === 0) {
    console.log(`Nenhum resultado. ${resultado1?.totalResultados || ''}`);
    console.log('Verifique o termo ou o filtro de data (em dias uteis use exactDate=dia).');
    await browser.close();
    return;
  }

  console.log(`Total anunciado: ${resultado1.totalResultados}`);
  console.log(
    `Paginas disponiveis: ${resultado1.totalPages} | Itens na pag. 1: ${resultado1.publicacoes.length}\n`
  );

  let todasPublicacoes = [...resultado1.publicacoes];
  let resultadoAtual = resultado1;
  let paginaAtual = 1;

  // Buscar paginas seguintes se necessario, ate MAX_PAGINAS
  while (paginaAtual < Math.min(resultado1.totalPages, MAX_PAGINAS)) {
    const proxPag = paginaAtual + 1;
    const urlProx = buildProximaPaginaUrl(TERMO, resultadoAtual, proxPag);

    process.stdout.write(`Buscando pagina ${proxPag}...`);
    await page
      .goto(urlProx, { waitUntil: 'domcontentloaded', timeout: 60000 })
      .catch((e) => {});

    const res = await extrairDadosDaPagina(page);
    if (!res || res.publicacoes.length === 0) break;

    process.stdout.write(` ${res.publicacoes.length} itens.\n`);
    todasPublicacoes = [...todasPublicacoes, ...res.publicacoes];
    resultadoAtual = res;
    paginaAtual = proxPag;
  }

  console.log(`\n=== Total coletado: ${todasPublicacoes.length} publicacoes ===\n`);

  // Exibir preview das primeiras 5
  todasPublicacoes.slice(0, 5).forEach((pub, i) => {
    console.log(`--- [${i + 1}] ---`);
    console.log(`Tipo:   ${pub.artType}`);
    console.log(`Orgao:  ${pub.hierarchyStr}`);
    console.log(`Edicao: N ${pub.editionNumber} de ${pub.pubDate} - Pag. ${pub.numberPage}`);
    console.log(`Titulo: ${pub.title}`);
    console.log(`Link:   https://www.in.gov.br/web/dou/-/${pub.urlTitle}`);
    console.log(`Resumo: ${limparHTML(pub.content).slice(0, 180)}...`);
    console.log('');
  });

  if (todasPublicacoes.length > 5) {
    console.log(`... e mais ${todasPublicacoes.length - 5} publicacoes no dou-resultados.json\n`);
  }

  // Salvar JSON limpo e estruturado
  const output = {
    termo: TERMO,
    filtroData: EXACT_DATE,
    totalAnunciado: resultado1.totalResultados,
    paginasColetadas: paginaAtual,
    totalColetado: todasPublicacoes.length,
    geradoEm: new Date().toISOString(),
    publicacoes: todasPublicacoes.map((pub) => ({
      tipo: pub.artType,
      secao: pub.pubName,  // DO1, DO2, DO3, etc.
      orgaos: pub.hierarchyList,
      edicao: pub.editionNumber,
      pagina: pub.numberPage,
      titulo: pub.title,
      data: pub.pubDate,
      link: `https://www.in.gov.br/web/dou/-/${pub.urlTitle}`,
      resumo: limparHTML(pub.content),
      classPK: pub.classPK, // ID unico da publicacao no portal
    })),
  };

  fs.writeFileSync('dou-resultados.json', JSON.stringify(output, null, 2));
  console.log('Dados salvos em dou-resultados.json');

  await browser.close();
})();
