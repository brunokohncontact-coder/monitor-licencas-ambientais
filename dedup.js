// Modulo de deduplicacao — guarda em SQLite quais publicacoes ja foram
// alertadas, para nao enviar o mesmo e-mail duas vezes.
//
// Identificador unico: (fonte, classPK)
// - DOU: classPK = id da publicacao no portal in.gov.br
// - IBAMA: classPK = SEQ_AUTO_INFRACAO ou SEQ_TERMO_EMBARGO
// PK composta evita colisao entre IDs numericos das duas fontes.

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'dedup.db');

// Cria o schema atual (PK composta com fonte).
function criarSchemaAtual(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS alertas_enviados (
      fonte TEXT NOT NULL,
      classPK TEXT NOT NULL,
      cnpj TEXT NOT NULL,
      empresa TEXT NOT NULL,
      titulo TEXT,
      data_publicacao TEXT,
      alertado_em TEXT NOT NULL,
      PRIMARY KEY (fonte, classPK)
    );

    CREATE INDEX IF NOT EXISTS idx_cnpj ON alertas_enviados(cnpj);
    CREATE INDEX IF NOT EXISTS idx_alertado_em ON alertas_enviados(alertado_em);
    CREATE INDEX IF NOT EXISTS idx_fonte ON alertas_enviados(fonte);
  `);
}

// Migra schema antigo (sem coluna fonte, PK apenas em classPK) para o novo.
// SQLite nao deixa alterar PK, entao recria a tabela e copia os dados.
// Idempotente: se ja estiver migrado, nao faz nada.
function migrarSeNecessario(db) {
  const cols = db.prepare('PRAGMA table_info(alertas_enviados)').all();
  if (cols.length === 0) return; // tabela nao existe ainda, criarSchemaAtual cuida
  const temFonte = cols.some((c) => c.name === 'fonte');
  if (temFonte) return;

  console.log('Migrando schema dedup: adicionando coluna "fonte"...');

  db.exec(`
    BEGIN;

    CREATE TABLE alertas_enviados_v2 (
      fonte TEXT NOT NULL,
      classPK TEXT NOT NULL,
      cnpj TEXT NOT NULL,
      empresa TEXT NOT NULL,
      titulo TEXT,
      data_publicacao TEXT,
      alertado_em TEXT NOT NULL,
      PRIMARY KEY (fonte, classPK)
    );

    INSERT INTO alertas_enviados_v2 (fonte, classPK, cnpj, empresa, titulo, data_publicacao, alertado_em)
      SELECT 'DOU', classPK, cnpj, empresa, titulo, data_publicacao, alertado_em
      FROM alertas_enviados;

    DROP TABLE alertas_enviados;
    ALTER TABLE alertas_enviados_v2 RENAME TO alertas_enviados;

    COMMIT;
  `);

  const n = db.prepare('SELECT COUNT(*) AS n FROM alertas_enviados').get().n;
  console.log(`Migracao concluida. Linhas existentes marcadas como fonte='DOU': ${n}`);
}

function inicializarDB(caminhoOverride = null) {
  const db = new Database(caminhoOverride || DB_PATH);
  db.pragma('journal_mode = WAL');
  migrarSeNecessario(db);
  criarSchemaAtual(db);
  return db;
}

// Filtra publicacoes pela fonte: separa novas (nunca alertadas) das ja alertadas.
// Publicacoes sem classPK passam como novas (nao temos como dedup-las).
function filtrarNaoAlertadas(db, publicacoes, fonte) {
  if (publicacoes.length === 0) return { novas: [], jaAlertadas: [] };

  const stmt = db.prepare('SELECT 1 FROM alertas_enviados WHERE fonte = ? AND classPK = ?');
  const novas = [];
  const jaAlertadas = [];

  for (const pub of publicacoes) {
    if (!pub.classPK) {
      novas.push(pub);
      continue;
    }
    if (stmt.get(fonte, String(pub.classPK))) {
      jaAlertadas.push(pub);
    } else {
      novas.push(pub);
    }
  }

  return { novas, jaAlertadas };
}

// Marca publicacoes como alertadas. So chamar apos envio bem-sucedido.
function marcarComoAlertadas(db, publicacoes, contextoPorClassPK, fonte) {
  if (publicacoes.length === 0) return 0;

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO alertas_enviados
      (fonte, classPK, cnpj, empresa, titulo, data_publicacao, alertado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const agora = new Date().toISOString();
  const inserir = db.transaction((pubs) => {
    let count = 0;
    for (const pub of pubs) {
      if (!pub.classPK) continue;
      const ctx = contextoPorClassPK[pub.classPK] || {};
      const r = stmt.run(
        fonte,
        String(pub.classPK),
        ctx.cnpj || '',
        ctx.empresa || '',
        pub.titulo || '',
        pub.data || '',
        agora
      );
      if (r.changes > 0) count++;
    }
    return count;
  });

  return inserir(publicacoes);
}

// Marca direto, sem precisar de publicacoes — util para backfill IBAMA
// (registrar todos os SEQ_AUTO_INFRACAO historicos sem enviar e-mail).
function marcarIdsComoAlertadas(db, fonte, ids, contexto = {}) {
  if (ids.length === 0) return 0;

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO alertas_enviados
      (fonte, classPK, cnpj, empresa, titulo, data_publicacao, alertado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const agora = new Date().toISOString();
  const inserir = db.transaction(() => {
    let count = 0;
    for (const id of ids) {
      const r = stmt.run(
        fonte,
        String(id),
        contexto.cnpj || '',
        contexto.empresa || '',
        contexto.titulo || '(backfill)',
        contexto.data || '',
        agora
      );
      if (r.changes > 0) count++;
    }
    return count;
  });

  return inserir();
}

// Diagnostico.
function contar(db, fonte = null, cnpj = null) {
  if (fonte && cnpj) {
    return db.prepare('SELECT COUNT(*) AS n FROM alertas_enviados WHERE fonte = ? AND cnpj = ?').get(fonte, cnpj).n;
  }
  if (fonte) {
    return db.prepare('SELECT COUNT(*) AS n FROM alertas_enviados WHERE fonte = ?').get(fonte).n;
  }
  if (cnpj) {
    return db.prepare('SELECT COUNT(*) AS n FROM alertas_enviados WHERE cnpj = ?').get(cnpj).n;
  }
  return db.prepare('SELECT COUNT(*) AS n FROM alertas_enviados').get().n;
}

module.exports = {
  inicializarDB,
  filtrarNaoAlertadas,
  marcarComoAlertadas,
  marcarIdsComoAlertadas,
  contar,
  DB_PATH,
};
