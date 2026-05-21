// Modulo de diarios estaduais — registry por UF no padrao de ibama.js:FONTES.
// Cada UF registra uma funcao de busca que devolve publicacoes ja no shape
// normalizado do DOU. Hoje so SP (DOESP) esta implementado; UFs sem registro
// sao puladas com aviso pelo monitor.js, sem derrubar o pipeline.
//
// --- Investigacao ao vivo do portal DOESP (doe.sp.gov.br, maio/2026) ---
// O portal de busca (doe.sp.gov.br/busca-avancada) e uma SPA Next.js. A busca
// real e atendida por um endpoint JSON publico, descoberto inspecionando os
// bundles do portal:
//   GET https://do-api-web-search.doe.sp.gov.br/v2/advanced-search/publications
// Parametros (querystring): Terms[0]=<termo>, FromDate=AAAA-M-D,
// ToDate=AAAA-M-D, PageNumber (1-based), PageSize.
// Resposta: { items:[{id,date,title,slug,excerpt,hierarchy,...}],
//             currentPage, totalPages, totalItems, hasNextPage, ... }.
//
// A busca por CNPJ FUNCIONA, mas apenas com o CNPJ formatado (com pontuacao,
// ex: "43.776.491/0001-70"); o CNPJ so-digitos nao casa, porque as publicacoes
// trazem o numero formatado no texto. Por isso a busca usa o CNPJ exatamente
// como esta no config. Como o endpoint e JSON, esta fonte nao precisa de
// navegador (Playwright) — uma requisicao https direta basta.

const https = require('https');
const querystring = require('querystring');
const { comRetentativa } = require('./retry');

const DOESP_API_URL =
  'https://do-api-web-search.doe.sp.gov.br/v2/advanced-search/publications';
const DOESP_BASE_PUBLICACAO = 'https://doe.sp.gov.br/';

// Remove tags HTML e normaliza espacos — mesma ideia de dou.js:limparHTML.
function limparTexto(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Date -> "AAAA-M-D" (formato que o endpoint do DOESP espera, sem zero-pad).
function formatarDataParam(d) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// Data ISO do DOESP ("2026-05-07T01:01:37") -> "07/05/2026". Mantem o shape
// de data do DOU (dd/MM/yyyy) para exibicao consistente no relatorio/e-mail.
function formatarDataPublicacao(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(iso);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// GET de JSON via https. O endpoint de busca do DOESP e um servico JSON
// publico — nao precisa de navegador. Lanca erro em status != 200 ou corpo
// que nao seja JSON valido, para a retentativa poder atuar.
function getJSON(url, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Accept: 'application/json',
          'Accept-Language': 'pt-BR,pt;q=0.9',
          Referer: 'https://doe.sp.gov.br/',
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} ao consultar o DOESP`));
        }
        let body = '';
        res.setEncoding('utf-8');
        res.on('data', (c) => {
          body += c;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error('Resposta do DOESP nao e um JSON valido'));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(timeoutMs, () =>
      req.destroy(new Error('Timeout na consulta ao DOESP'))
    );
  });
}

// Converte um item da API do DOESP para o shape de publicacao do DOU.
// Campos ausentes na origem (edicao, pagina) viram string vazia. O `tipo` e
// aproximado pela primeira palavra do titulo — no DOESP o tipo do ato aparece
// no proprio titulo (ex: "PORTARIA SMA...", "COMUNICADO, DE...").
function normalizarPublicacaoDOESP(item) {
  const dados = item || {};
  const titulo = limparTexto(dados.title);
  const hierarquia = limparTexto(dados.hierarchy);
  const orgaos = hierarquia
    ? hierarquia
        .split('>')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  return {
    tipo: titulo.split(/[\s,]+/)[0] || '',
    secao: orgaos[0] || '',
    orgaos,
    orgaoStr: hierarquia,
    edicao: '',
    pagina: '',
    titulo,
    data: formatarDataPublicacao(dados.date),
    link: dados.slug ? DOESP_BASE_PUBLICACAO + dados.slug : DOESP_BASE_PUBLICACAO,
    resumo: limparTexto(dados.excerpt),
    classPK: String(dados.id || ''),
  };
}

// Busca publicacoes no DOESP para um termo (tipicamente o CNPJ formatado).
// Pagina ate `maxPaginas` ou ate a API sinalizar que nao ha mais paginas.
// opcoes.diasMaximos  janela retroativa em dias (padrao 7)
// opcoes.dataFim      fim da janela (Date; padrao agora)
// opcoes.dataInicio   inicio da janela (Date; padrao dataFim - diasMaximos)
// opcoes.pageSize     itens por pagina (padrao 50)
// opcoes.maxPaginas   limite de paginas (padrao 3)
// opcoes.tentativas   tentativas por pagina em caso de falha (padrao 3)
// opcoes._buscarPagina  injecao do fetcher (usado nos testes — sem rede real)
async function buscarDOESP(termo, opcoes = {}) {
  const diasMaximos = opcoes.diasMaximos || 7;
  const dataFim = opcoes.dataFim instanceof Date ? opcoes.dataFim : new Date();
  const dataInicio =
    opcoes.dataInicio instanceof Date
      ? opcoes.dataInicio
      : new Date(dataFim.getTime() - diasMaximos * 86400000);
  const pageSize = opcoes.pageSize || 50;
  const maxPaginas = opcoes.maxPaginas || 3;
  const tentativas = opcoes.tentativas || 3;
  const esperaBaseMs = opcoes.esperaBaseMs != null ? opcoes.esperaBaseMs : 2000;
  const buscarPagina = opcoes._buscarPagina || getJSON;

  const publicacoes = [];
  let totalResultados = 0;

  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    const query = querystring.stringify({
      'Terms[0]': termo,
      FromDate: formatarDataParam(dataInicio),
      ToDate: formatarDataParam(dataFim),
      PageNumber: pagina,
      PageSize: pageSize,
    });
    const url = `${DOESP_API_URL}?${query}`;

    const resposta = await comRetentativa(() => buscarPagina(url), {
      tentativas,
      esperaBaseMs,
    });

    const itens =
      resposta && Array.isArray(resposta.items) ? resposta.items : [];
    totalResultados = Number(resposta && resposta.totalItems) || totalResultados;
    for (const item of itens) {
      publicacoes.push(normalizarPublicacaoDOESP(item));
    }

    if (!resposta || !resposta.hasNextPage || itens.length === 0) break;
  }

  return { publicacoes, totalResultados };
}

// Registry de diarios estaduais — uma chave por UF, no padrao de ibama.js:FONTES.
// Cada entrada expoe `buscar(browser, termo, opcoes)`, que devolve publicacoes
// no shape normalizado do DOU. O parametro `browser` (instancia do Playwright)
// faz parte do contrato comum do registry; o DOESP nao o utiliza (consome um
// endpoint JSON), mas diarios futuros que dependam de scraping vao precisar.
const DIARIOS = {
  SP: {
    uf: 'SP',
    nome: 'Diario Oficial do Estado de Sao Paulo',
    fonte: 'DOESP',
    buscar: async function buscar(browser, termo, opcoes = {}) {
      return buscarDOESP(termo, opcoes);
    },
  },
};

// Resolve as UFs a varrer: por padrao, a uniao do campo `uf` das empresas
// ativas; se a config define a lista `estados`, ela tem prioridade e
// sobrepoe (override) as UFs derivadas das empresas.
function ufsParaVarrer(empresasAtivas, override) {
  const norm = (v) => String(v || '').trim().toUpperCase();
  if (Array.isArray(override) && override.length > 0) {
    return [...new Set(override.map(norm).filter(Boolean))];
  }
  return [
    ...new Set(
      (empresasAtivas || []).map((e) => norm(e && e.uf)).filter(Boolean)
    ),
  ];
}

module.exports = {
  DIARIOS,
  ufsParaVarrer,
  normalizarPublicacaoDOESP,
  buscarDOESP,
};
