// Testes do modulo de deduplicacao (dedup.js).
// Migrado do antigo script ad-hoc teste-dedup.js para o runner node:test.
// Usa um banco SQLite em memoria (':memory:') — nao toca no dedup.db real
// nem deixa arquivos para limpar.

const test = require('node:test');
const assert = require('node:assert');
const {
  inicializarDB,
  filtrarNaoAlertadas,
  marcarComoAlertadas,
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
