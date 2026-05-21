// Modulo ICMBio — categorizacao de publicacoes do DOU pelo orgao emissor.
//
// Etapa 3, Parte A. Em vez de tratar o ICMBio como uma fonte de scraping
// separada, identificamos no proprio fluxo do DOU quais publicacoes foram
// emitidas pelo Instituto Chico Mendes e as marcamos com a categoria
// 'ICMBio'. O relatorio (monitor.js) e o e-mail (alerta.js) usam essa
// categoria para destacar visualmente esses itens.
//
// A categorizacao e uma FUNCAO PURA: sem rede, sem estado, sem efeitos
// colaterais — a mesma publicacao na entrada produz sempre a mesma saida.
// Isso a torna trivial de testar (ver icmbio.test.js) e desacoplada do
// scraping do DOU.
//
// --- Etapa 3, Parte B: investigacao de dados abertos do ICMBio (maio/2026) ---
//
// O blueprint pedia investigar dados.gov.br e o portal do ICMBio atras de
// datasets de autuacoes/embargos em Unidades de Conservacao que pudessem
// virar uma nova fonte no padrao de ibama.js:FONTES (download de zip ->
// extracao de CSV -> parse em streaming -> filtro por coluna de CNPJ).
//
// Resultado da investigacao:
//
// O ICMBio PUBLICA dados de fiscalizacao (autos de infracao e areas
// embargadas, com atualizacao mensal), porem APENAS em formato GEOESPACIAL:
//   - Geoservicos WFS/WMS no geoserver da INDE, camadas
//     "ICMBio:autos_infracao_icmbio" e "ICMBio:embargos_icmbio"
//     (https://geoservicos.inde.gov.br/geoserver/ICMBio/ows).
//   - Shapefile (.shp), KMZ e XLS no portal de Dados Geoespaciais do ICMBio.
//
// NAO existe um zip de CSV em massa equivalente ao auto_infracao_csv.zip do
// IBAMA (dadosabertos.ibama.gov.br). Por isso o padrao ibama.js:FONTES NAO
// se aplica ao ICMBio:
//   1. ibama.js:FONTES baixa um zip por HTTP, extrai CSVs e faz parse em
//      streaming filtrando por uma coluna de CNPJ — o ICMBio so oferece
//      servicos geoespaciais (WFS) e arquivos geoespaciais (SHP/KMZ).
//   2. O schema de atributos das camadas WFS (nome do campo de CNPJ, nome
//      do campo de data) nao e verificavel sem consumir o servico, e
//      inventar nomes de coluna violaria as guardrails do blueprint
//      (nao inventar dados/endpoints/estruturas).
//
// LIMITACAO DOCUMENTADA: a integracao das autuacoes/embargos do ICMBio como
// fonte automatica de dados abertos NAO foi implementada nesta etapa. Faze-lo
// exigiria um modulo geoespacial novo (cliente WFS GetFeature + parse de
// GeoJSON/GML), fora do padrao zip+CSV do ibama.js. Fica registrado como
// trabalho futuro. A cobertura do ICMBio nesta etapa e feita pela Parte A
// (categorizacao das publicacoes do ICMBio no DOU). Ver tambem o README.

// Termos que, no campo de orgao do DOU (orgaoStr / orgaos), indicam que a
// publicacao foi emitida pelo ICMBio. A comparacao e feita em minusculas.
const TERMOS_ICMBIO = ['icmbio', 'instituto chico mendes'];

// Categoria atribuida quando o orgao indica o ICMBio.
const CATEGORIA_ICMBIO = 'ICMBio';

// Categoriza o orgao emissor de uma publicacao do DOU.
//
// Recebe o shape normalizado produzido por dou.js, do qual usa dois campos:
//   - orgaoStr: string com a hierarquia de orgaos (hierarchyStr do portal);
//   - orgaos:   array de strings com a hierarquia (hierarchyList do portal).
//
// Retorna a string 'ICMBio' quando qualquer um dos campos menciona o
// instituto; caso contrario retorna null (categoria neutra). Funcao pura:
// nao faz rede, nao guarda estado, nao altera a publicacao recebida.
function categorizarOrgao(pub) {
  if (!pub || typeof pub !== 'object') return null;

  const partes = [pub.orgaoStr || ''];
  if (Array.isArray(pub.orgaos)) {
    partes.push(...pub.orgaos);
  }
  const texto = partes.join(' ').toLowerCase();

  if (TERMOS_ICMBIO.some((termo) => texto.includes(termo))) {
    return CATEGORIA_ICMBIO;
  }
  return null;
}

module.exports = { categorizarOrgao, CATEGORIA_ICMBIO };
