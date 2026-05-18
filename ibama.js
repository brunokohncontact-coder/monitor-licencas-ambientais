// Modulo IBAMA — baixa CSVs publicos de dados abertos, filtra por CNPJ.
//
// Estrategia:
// 1. Mantem zip local em ibama-cache/. Antes de baixar, faz GET com
//    If-Modified-Since; se servidor responder 304, usa cache.
// 2. Cada fonte sabe quais CSVs extrair do seu zip:
//    - autos: split por ano (carrega so ano atual + anterior)
//    - embargos: arquivo monolitico unico
// 3. Parse CSV em streaming (csv-parse stream API) — necessario para o
//    embargo de 170 MB que estouraria memoria se parseado de uma vez.
// 4. Filtra por CNPJ (normalizado para so digitos) e por data minima
//    (default: ultimos 30 dias).

const fs = require('fs');
const path = require('path');
const https = require('https');
const { Readable } = require('stream');
const AdmZip = require('adm-zip');
const { parse } = require('csv-parse');

const CACHE_DIR = path.join(__dirname, 'ibama-cache');

const FONTES = {
  autos: {
    nome: 'IBAMA Autos de Infracao',
    url: 'https://dadosabertos.ibama.gov.br/dados/SIFISC/auto_infracao/auto_infracao/auto_infracao_csv.zip',
    arquivoZip: 'auto_infracao.zip',
    arquivoMeta: 'auto_infracao.meta.json',
    tituloPrefixo: 'Auto',
    colunaId: 'SEQ_AUTO_INFRACAO',
    colunaCNPJ: 'CPF_CNPJ_INFRATOR',
    colunaData: 'DT_LANCAMENTO',
    colunaTitulo: 'NUM_AUTO_INFRACAO',
    colunaDesc: 'DES_AUTO_INFRACAO',
    colunaValor: 'VAL_AUTO_INFRACAO',
    colunaUF: 'UF',
    colunaMunicipio: 'MUNICIPIO',
    colunaProcesso: 'NUM_PROCESSO_FORMATADO',
    colunaTipoPessoa: 'TP_PESSOA_INFRATOR',
    colunaNome: 'NOME_INFRATOR',
    // Autos vem split por ano dentro do zip. Carrega ano atual + anterior
    // para cobrir lancamentos retroativos perto da virada.
    obterArquivosCSV: (zip) => {
      const anoAtual = new Date().getFullYear();
      const buffers = [];
      for (const ano of [anoAtual, anoAtual - 1]) {
        const entry = zip.getEntry(`auto_infracao_ano_${ano}.csv`);
        if (entry) buffers.push({ nome: `ano_${ano}`, buffer: entry.getData() });
      }
      return buffers;
    },
  },

  embargos: {
    nome: 'IBAMA Termos de Embargo',
    url: 'https://dadosabertos.ibama.gov.br/dados/SIFISC/termo_embargo/termo_embargo/termo_embargo_csv.zip',
    arquivoZip: 'termo_embargo.zip',
    arquivoMeta: 'termo_embargo.meta.json',
    tituloPrefixo: 'Embargo',
    colunaId: 'SEQ_TAD',
    colunaCNPJ: 'CPF_CNPJ_EMBARGADO',
    colunaData: 'DAT_EMBARGO',
    colunaTitulo: 'NUM_TAD',
    colunaDesc: 'DES_TAD',
    colunaArea: 'QTD_AREA_EMBARGADA',
    colunaUF: 'UF',
    colunaMunicipio: 'MUNICIPIO',
    colunaProcesso: 'NUM_PROCESSO',
    colunaNome: 'NOME_EMBARGADO',
    // Embargos vem num arquivo monolitico.
    obterArquivosCSV: (zip) => {
      const entry = zip.getEntry('termo_embargo.csv');
      return entry ? [{ nome: 'termo_embargo', buffer: entry.getData() }] : [];
    },
  },
};

// Normaliza CNPJ/CPF: tira tudo que nao for digito. Permite comparar
// "43.776.491/0001-70" com "43776491000170".
function normalizarCNPJ(s) {
  return String(s || '').replace(/\D/g, '');
}

// Parse de data: aceita "2026-01-02" ou "2026-01-02 07:02:00".
function parseDataIBAMA(s) {
  if (!s) return null;
  const parte = String(s).slice(0, 10);
  const m = parte.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
}

function garantirCache() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

// Download condicional usando If-Modified-Since. Salva zip e meta no cache.
function baixarSeMudou(fonte) {
  garantirCache();
  const zipPath = path.join(CACHE_DIR, fonte.arquivoZip);
  const metaPath = path.join(CACHE_DIR, fonte.arquivoMeta);

  let meta = {};
  if (fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    } catch {
      meta = {};
    }
  }

  const headers = {};
  if (meta.lastModified && fs.existsSync(zipPath)) {
    headers['If-Modified-Since'] = meta.lastModified;
  }

  return new Promise((resolve, reject) => {
    const req = https.get(fonte.url, { headers }, (res) => {
      if (res.statusCode === 304) {
        res.resume();
        return resolve({ zipPath, atualizado: false, lastModified: meta.lastModified });
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} ao baixar ${fonte.url}`));
      }

      const tmp = zipPath + '.tmp';
      const file = fs.createWriteStream(tmp);
      res.pipe(file);
      file.on('error', reject);
      file.on('finish', () => {
        file.close((err) => {
          if (err) return reject(err);
          fs.renameSync(tmp, zipPath);
          const novaMeta = {
            lastModified: res.headers['last-modified'] || null,
            etag: res.headers['etag'] || null,
            tamanho: Number(res.headers['content-length'] || 0),
            baixadoEm: new Date().toISOString(),
          };
          fs.writeFileSync(metaPath, JSON.stringify(novaMeta, null, 2));
          resolve({ zipPath, atualizado: true, ...novaMeta });
        });
      });
    });
    req.on('error', reject);
    req.setTimeout(300000, () => req.destroy(new Error('Timeout no download IBAMA')));
  });
}

// Stream-parse de um buffer CSV. Filtra cada linha sob demanda, descarta
// nao-matches imediatamente — economiza memoria para arquivos grandes.
function filtrarCSVStream(csvBuffer, fonte, cnpjsNormalizados, dataMinima) {
  return new Promise((resolve, reject) => {
    const matches = [];
    const parser = parse({
      columns: true,
      delimiter: ';',
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true,
      trim: true,
    });

    parser.on('readable', () => {
      let row;
      while ((row = parser.read()) !== null) {
        const cnpjRow = normalizarCNPJ(row[fonte.colunaCNPJ]);
        if (!cnpjRow || !cnpjsNormalizados.has(cnpjRow)) continue;
        const dataRow = parseDataIBAMA(row[fonte.colunaData]);
        if (!dataRow || dataRow < dataMinima) continue;
        matches.push(normalizarRow(row, fonte));
      }
    });
    parser.on('error', reject);
    parser.on('end', () => resolve(matches));

    Readable.from(csvBuffer).pipe(parser);
  });
}

// Converte uma linha em shape padrao. Campos nao presentes na fonte
// (ex: valor para embargos, area para autos) viram string vazia.
function normalizarRow(row, fonte) {
  return {
    classPK: String(row[fonte.colunaId] || ''),
    cnpj: row[fonte.colunaCNPJ] || '',
    nome: row[fonte.colunaNome] || '',
    titulo: `${fonte.tituloPrefixo} ${row[fonte.colunaTitulo] || ''}`.trim(),
    data: row[fonte.colunaData] || '',
    resumo: row[fonte.colunaDesc] || '',
    valor: fonte.colunaValor ? row[fonte.colunaValor] || '' : '',
    area: fonte.colunaArea ? row[fonte.colunaArea] || '' : '',
    uf: row[fonte.colunaUF] || '',
    municipio: row[fonte.colunaMunicipio] || '',
    processo: row[fonte.colunaProcesso] || '',
    fonteOrigem: fonte.nome,
  };
}

async function buscarFonte(fonteKey, cnpjs, opcoes = {}) {
  const fonte = FONTES[fonteKey];
  if (!fonte) throw new Error(`Fonte IBAMA desconhecida: ${fonteKey}`);

  const diasMaximos = opcoes.diasMaximos || 30;
  const dataMinima = new Date(Date.now() - diasMaximos * 86400_000);

  const cnpjsNorm = new Set(cnpjs.map(normalizarCNPJ).filter(Boolean));
  if (cnpjsNorm.size === 0) {
    return { publicacoes: [], detalhes: 'Nenhum CNPJ valido configurado' };
  }

  console.log(`  [${fonte.nome}] verificando cache do zip...`);
  const baixa = await baixarSeMudou(fonte);
  console.log(
    `  [${fonte.nome}] cache ${baixa.atualizado ? 'atualizado (download fresco)' : 'reusado (304 Not Modified)'}, last-modified: ${baixa.lastModified}`
  );

  const zip = new AdmZip(baixa.zipPath);
  const arquivos = fonte.obterArquivosCSV(zip);

  let todasMatches = [];
  for (const { nome, buffer } of arquivos) {
    const matches = await filtrarCSVStream(buffer, fonte, cnpjsNorm, dataMinima);
    console.log(`  [${fonte.nome}] ${nome}: ${matches.length} match(es)`);
    todasMatches = todasMatches.concat(matches);
  }

  return { publicacoes: todasMatches, dataMinima: dataMinima.toISOString() };
}

module.exports = { buscarFonte, FONTES, normalizarCNPJ };
