// Testes do modulo de deduplicacao (dedup.js).
// Migrado do antigo script ad-hoc teste-dedup.js para o runner node:test.
// Usa um banco SQLite em memoria (':memory:') — nao toca no dedup.db real
// nem deixa arquivos para limpar.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const {
  inicializarDB,
  filtrarNaoAlertadas,
  marcarComoAlertadas,
  marcarIdsComoAlertadas,
  contar,
} = require('./dedup');

// Um unico banco em memoria compartilhado pelos testes deste arquivo —
// os casos sao sequenciais e dependentes, como no script original.
const db = inicializarDB(':memory:');

// cliente_id fixo para todos os testes — isolamento por cliente e TASK3.
const CLIENT_ID = 'test-client';

const pubsLote1 = [
  { classPK: 'PK-001', titulo: 'Renovacao de licenca CETESB', data: '15/05/2026' },
  { classPK: 'PK-002', titulo: 'Auto de infracao IBAMA', data: '15/05/2026' },
];

const contexto1 = {
  'PK-001': { cnpj: '43.776.491/0001-70', empresa: 'CETESB' },
  'PK-002': { cnpj: '43.776.491/0001-70', empresa: 'CETESB' },
};

test('primeira execucao: todas as publicacoes sao novas', () => {
  const r = filtrarNaoAlertadas(db, pubsLote1, 'DOU', CLIENT_ID);
  assert.strictEqual(r.novas.length, 2);
  assert.strictEqual(r.jaAlertadas.length, 0);
});

test('marcarComoAlertadas grava as publicacoes enviadas', () => {
  const n = marcarComoAlertadas(db, pubsLote1, contexto1, 'DOU', CLIENT_ID);
  assert.strictEqual(n, 2);
});

test('segunda execucao: publicacoes ja alertadas sao reconhecidas', () => {
  const r = filtrarNaoAlertadas(db, pubsLote1, 'DOU', CLIENT_ID);
  assert.strictEqual(r.novas.length, 0);
  assert.strictEqual(r.jaAlertadas.length, 2);
});

test('lote misto: separa a publicacao nova da ja alertada', () => {
  const lote2 = [
    { classPK: 'PK-001', titulo: 'duplicada', data: '15/05/2026' },
    { classPK: 'PK-003', titulo: 'Embargo novo', data: '16/05/2026' },
  ];
  const r = filtrarNaoAlertadas(db, lote2, 'DOU', CLIENT_ID);
  assert.strictEqual(r.novas.length, 1);
  assert.strictEqual(r.jaAlertadas.length, 1);
  assert.strictEqual(r.novas[0].classPK, 'PK-003');
});

test('publicacao sem classPK e tratada como nova (nao da para deduplicar)', () => {
  const r = filtrarNaoAlertadas(db, [{ classPK: '', titulo: 'sem id', data: '17/05/2026' }], 'DOU', CLIENT_ID);
  assert.strictEqual(r.novas.length, 1);
});

test('marcacao e idempotente: remarcar nao duplica', () => {
  const n = marcarComoAlertadas(db, pubsLote1, contexto1, 'DOU', CLIENT_ID);
  assert.strictEqual(n, 0);
});

test('contar: total geral e total por fonte/cnpj', () => {
  assert.strictEqual(contar(db), 2);
  assert.strictEqual(contar(db, 'DOU', '43.776.491/0001-70'), 2);
});

test('PK composta: mesma classPK em fonte diferente nao colide', () => {
  const pubsIBAMA = [{ classPK: 'PK-001', titulo: 'IBAMA mesma PK', data: '17/05/2026' }];

  const r = filtrarNaoAlertadas(db, pubsIBAMA, 'IBAMA', CLIENT_ID);
  assert.strictEqual(r.novas.length, 1, 'mesma PK que o DOU, mas em IBAMA, e nova');

  marcarComoAlertadas(db, pubsIBAMA, { 'PK-001': { cnpj: 'x', empresa: 'y' } }, 'IBAMA', CLIENT_ID);

  assert.strictEqual(
    filtrarNaoAlertadas(db, pubsIBAMA, 'IBAMA', CLIENT_ID).jaAlertadas.length,
    1,
    'apos marcar, a PK em IBAMA e reconhecida como ja alertada'
  );
  assert.strictEqual(
    filtrarNaoAlertadas(db, pubsLote1, 'DOU', CLIENT_ID).jaAlertadas.length,
    2,
    'a marcacao em IBAMA nao afetou os registros do DOU'
  );
});

// --- Isolamento por cliente_id ---

test('isolamento por cliente_id: mesmo classPK, clientes diferentes nao colidem', () => {
  const dbIso = inicializarDB(':memory:');
  const pub = [{ classPK: 'PK-ISO', titulo: 'Publicacao compartilhada', data: '20/05/2026' }];
  const ctx = { 'PK-ISO': { cnpj: '11.111.111/0001-11', empresa: 'Empresa Iso' } };

  marcarComoAlertadas(dbIso, pub, ctx, 'DOU', 'cliente-A');

  const rB = filtrarNaoAlertadas(dbIso, pub, 'DOU', 'cliente-B');
  assert.strictEqual(rB.novas.length, 1, 'cliente-B ainda nao alertado: deve ver como nova');
  assert.strictEqual(rB.jaAlertadas.length, 0);

  const rA = filtrarNaoAlertadas(dbIso, pub, 'DOU', 'cliente-A');
  assert.strictEqual(rA.jaAlertadas.length, 1, 'cliente-A ja alertado: deve reconhecer');
  assert.strictEqual(rA.novas.length, 0);
});

test('marcarIdsComoAlertadas com cliente_id: registros isolados por cliente', () => {
  const dbIds = inicializarDB(':memory:');

  marcarIdsComoAlertadas(dbIds, 'IBAMA', ['SEQ-001', 'SEQ-002'], 'cliente-X', { cnpj: '22.222.222/0001-22', empresa: 'Empresa X' });

  assert.strictEqual(contar(dbIds, 'IBAMA', null, 'cliente-X'), 2);
  assert.strictEqual(contar(dbIds, 'IBAMA', null, 'cliente-Y'), 0, 'cliente-Y nao tem registros');
});

// --- Migracao v2 -> v3 ---

test('migracao v2->v3: linhas existentes recebem cliente_id=default', () => {
  const tmpPath = path.join(os.tmpdir(), `dedup-test-migration-${Date.now()}.db`);
  try {
    // Monta um banco com schema v2 (sem cliente_id) e insere uma linha legada.
    const dbV2 = new Database(tmpPath);
    dbV2.exec(`
      CREATE TABLE alertas_enviados (
        fonte TEXT NOT NULL,
        classPK TEXT NOT NULL,
        cnpj TEXT NOT NULL,
        empresa TEXT NOT NULL,
        titulo TEXT,
        data_publicacao TEXT,
        alertado_em TEXT NOT NULL,
        PRIMARY KEY (fonte, classPK)
      );
      INSERT INTO alertas_enviados
        VALUES ('DOU', 'PK-LEGACY', '00.000.000/0001-00', 'Empresa Antiga', 'titulo legado', '2024-01-01', '2024-01-01T00:00:00.000Z');
    `);
    dbV2.close();

    // Abre o banco via inicializarDB — deve detectar schema v2 e migrar.
    const migrado = inicializarDB(tmpPath);
    const row = migrado.prepare('SELECT * FROM alertas_enviados WHERE fonte=? AND classPK=?').get('DOU', 'PK-LEGACY');
    assert.ok(row, 'linha legada deve ser preservada apos migracao');
    assert.strictEqual(row.cliente_id, 'default', 'linha legada deve receber cliente_id=default');
    migrado.close();
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* noop */ }
  }
});
