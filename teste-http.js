// Teste: conseguimos os resultados sem Playwright, com um GET simples?
const https = require('https');

const url = 'https://www.in.gov.br/consulta/-/buscar/dou?q=licen%C3%A7a%20ambiental&s=todos';

const options = {
  hostname: 'www.in.gov.br',
  path: '/consulta/-/buscar/dou?q=licen%C3%A7a%20ambiental&s=todos',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'pt-BR,pt;q=0.9',
  },
};

https.get(options, (res) => {
  let html = '';
  res.on('data', (chunk) => (html += chunk));
  res.on('end', () => {
    const total = html.match(/(\d+) resultados para/)?.[1] || 'nao encontrado';
    const wrappers = (html.match(/resultados-wrapper/g) || []).length;
    const titulos = (html.match(/title-marker/g) || []).length;

    console.log(`Status HTTP: ${res.statusCode}`);
    console.log(`Tamanho da resposta: ${Math.round(html.length / 1024)} KB`);
    console.log(`Total anunciado: ${total} resultados`);
    console.log(`<div class="resultados-wrapper"> encontrados: ${wrappers}`);
    console.log(`<h5 class="title-marker"> encontrados: ${titulos}`);

    if (titulos > 0) {
      console.log('\n-> Resultados ja estao no HTML puro. Playwright desnecessario!');
    } else {
      console.log('\n-> Sem resultados no HTML puro. Playwright ainda necessario.');
    }

    // Salvar pra comparar com a versao renderizada pelo Playwright
    require('fs').writeFileSync('dou-raw.html', html);
    console.log('HTML bruto salvo em dou-raw.html');
  });
}).on('error', (e) => console.error('Erro:', e.message));
