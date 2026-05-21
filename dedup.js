// Modulo de deduplicacao — guarda em SQLite quais publicacoes ja foram
// alertadas, para nao enviar o mesmo e-mail duas vezes.
//
// Identificador unico: (cliente_id, fonte, classPK)
// - cliente_id: isola os clientes — dois clientes que monitoram a mesma
//   empresa recebem alertas de forma independente.
// - fonte: 'DOU' ou 'IBAMA' — evita colisao entre IDs numericos das fontes.
// - classPK: id da publicacao na origem (portal do DOU ou SEQ_* do IBAMA).

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'dedup.db');

// Cria o schema atual (PK composta com cliente_id, fonte e classPK).
function criarSchemaAtual(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS alertas_enviados (
      cliente_id TEXT NOT NULL,
      fonte TEXT NOT NULL,
      classPK TEXT NOT NULL,
      cnpj TEXT NOT NULL,
      empresa TEXT NOT NULL,
      titulo TEXT,
      data_publicacao TEXT,
      alertado_em TEXT NOT NULL,
      PRIMARY KEY (cliente_id, fonte, classPK)
    );

    CREATE INDEX IF NOT EXISTS idx_cnpj ON alertas_enviados(cnpj);
    CREATE INDEX IF NOT EXISTS idx_alertado_em ON alertas_enviados(alertado_em);
    CREATE INDEX IF NOT EXISTS idx_fonte ON alertas_enviados(fonte);
    CREATE INDEX IF NOT EXISTS idx_cliente ON alertas_enviados(cliente_id);
  `);
}

// Migra schemas antigos para o atual. O SQLite nao deixa alterar a PK, entao
// cada passo recria a tabela e copia os dados. Idempotente: roda apenas o que
// ainda falta. Passos:
//   v1 -> v2: adiciona a coluna 'fonte' (linhas antigas viram fonte='DOU').
//   v2 -> v3: adiciona a coluna 'cliente_id' (linhas viram cliente_id='default').
function migrarSeNecessario(db) {
  const cols = db.prepare('PRAGMA table_info(alertas_enviados)').all();
  if (cols.length === 0) return; // tabela nao existe — criarSchemaAtual cuida

  const temFonte = cols.some((c) => c.name === 'fonte');
  const temClienteId = cols.some((c) => c.name === 'cliente_id');

  // Migracao v1 -> v2: introduz a coluna 'fonte'.
  if (!temFonte) {
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
  }

  // Migracao v2 -> v3: introduz a coluna 'cliente_id'.
  if (!temClienteId) {
    console.log('Migrando schema dedup: adicionando coluna "cliente_id"...');
    db.exec(`
      BEGIN;

      CREATE TABLE alertas_enviados_v3 (
        cliente_id TEXT NOT NULL,
        fonte TEXT NOT NULL,
        classPK TEXT NOT NULL,
        cnpj TEXT NOT NULL,
        empresa TEXT NOT NULL,
        titulo TEXT,
        data_publicacao TEXT,
        alertado_em TEXT NOT NULL,
        PRIMARY KEY (cliente_id, fonte, classPK)
      );

      INSERT INTO alertas_enviados_v3 (cliente_id, fonte, classPK, cnpj, empresa, titulo, data_publicacao, alertado_em)
        SELECT 'default', fonte, classPK, cnpj, empresa, titulo, data_publicacao, alertado_em
        FROM alertas_enviados;

      DROP TABLE alertas_enviados;
      ALTER TABLE alertas_enviados_v3 RENAME TO alertas_enviados;

      COMMIT;
    `);
    const n = db.prepare('SELECT COUNT(*) AS n FROM alertas_enviados').get().n;
    console.log(`Migracao concluida. Linhas existentes marcadas com cliente_id='default': ${n}`);
  }
}

function inicializarDB(caminhoOverride = null) {
  const db = new Database(caminhoOverride || DB_PATH);
  db.pragma('journal_mode = WAL');
  migrarSeNecessario(db);
  criarSchemaAtual(db);
  return db;
}

// Filtra publicacoes de um cliente/fonte: separa as novas (nunca alertadas
// para aquele cliente) das ja alertadas. Publicacoes sem classPK passam como
// novas (nao temos como deduplica-las).
function filtrarNaoAlertadas(db, publicacoes, fonte, clienteId) {
  if (publicacoes.length === 0) return { novas: [], jaAlertadas: [] };

  const stmt = db.prepare(
    'SELECT 1 FROM alertas_enviados WHERE cliente_id = ? AND fonte = ? AND classPK = ?'
  );
  const novas = [];
  const jaAlertadas = [];

  for (const pub of publicacoes) {
    if (!pub.classPK) {
      novas.push(pub);
      continue;
    }
    if (stmt.get(clienteId, fonte, String(pub.classPK))) {
      jaAlertadas.push(pub);
    } else {
      novas.push(pub);
    }
  }

  return { novas, jaAlertadas };
}

// Marca publicacoes como alertadas para um cliente. So chamar apos o envio
// bem-sucedido do e-mail.
function marcarComoAlertadas(db, publicacoes, contextoPorClassPK, fonte, clienteId) {
  if (publicacoes.length === 0) return 0;

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO alertas_enviados
      (cliente_id, fonte, classPK, cnpj, empresa, titulo, data_publicacao, alertado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const agora = new Date().toISOString();
  const inserir = db.transaction((pubs) => {
    let count = 0;
    for (const pub of pubs) {
      if (!pub.classPK) continue;
      const ctx = contextoPorClassPK[pub.classPK] || {};
      const r = stmt.run(
        clienteId,
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
function marcarIdsComoAlertadas(db, fonte, ids, clienteId, contexto = {}) {
  if (ids.length === 0) return 0;

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO alertas_enviados
      (cliente_id, fonte, classPK, cnpj, empresa, titulo, data_publicacao, alertado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const agora = new Date().toISOString();
  const inserir = db.transaction(() => {
    let count = 0;
    for (const id of ids) {
      const r = stmt.run(
        clienteId,
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

// Diagnostico. Conta linhas, opcionalmente filtrando por fonte, cnpj e cliente.
function contar(db, fonte = null, cnpj = null, clienteId = null) {
  const condicoes = [];
  const params = [];
  if (clienteId) {
    condicoes.push('cliente_id = ?');
    params.push(clienteId);
  }
  if (fonte) {
    condicoes.push('fonte = ?');
    params.push(fonte);
  }
  if (cnpj) {
    condicoes.push('cnpj = ?');
    params.push(cnpj);
  }
  const where = condicoes.length ? ` WHERE ${condicoes.join(' AND ')}` : '';
  return db.prepare(`SELECT COUNT(*) AS n FROM alertas_enviados${where}`).get(...params).n;
}

module.exports = {
  inicializarDB,
  filtrarNaoAlertadas,
  marcarComoAlertadas,
  marcarIdsComoAlertadas,
  contar,
  DB_PATH,
};
