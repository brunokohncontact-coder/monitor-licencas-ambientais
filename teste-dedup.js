// Teste isolado do modulo dedup.
// Cria publicacoes ficticias, insere algumas, e confirma que:
// 1. Primeira execucao: tudo e "novo"
// 2. Apos marcar como alertadas, segunda execucao: tudo e "ja alertado"
// 3. Mistura de publicacoes novas + ja vistas e separada corretamente

const fs = require('fs');
const path = require('path');
const { inicializarDB, filtrarNaoAlertadas, marcarComoAlertadas, contar } = require('./dedup');

// Banco isolado para o teste — NUNCA tocar no dedup.db de producao.
const DB_PATH = path.join(__dirname, 'teste-dedup.db');

function assert(cond, msg) {
  if (!cond) {
    console.error(`FALHOU: ${msg}`);
    process.exit(1);
  }
  console.log(`OK: ${msg}`);
}

// Comecar com banco limpo (apenas para o teste)
if (fs.existsSync(DB_PATH)) {
  fs.unlinkSync(DB_PATH);
}
// WAL files
['-wal', '-shm'].forEach((suf) => {
  const f = DB_PATH + suf;
  if (fs.existsSync(f)) fs.unlinkSync(f);
});

const db = inicializarDB(DB_PATH);

const pubsLote1 = [
  { classPK: 'PK-001', titulo: 'Renovacao de licenca CETESB', data: '15/05/2026' },
  { classPK: 'PK-002', titulo: 'Auto de infracao IBAMA', data: '15/05/2026' },
];

const contexto1 = {
  'PK-001': { cnpj: '43.776.491/0001-70', empresa: 'CETESB' },
  'PK-002': { cnpj: '43.776.491/0001-70', empresa: 'CETESB' },
};

// Teste 1: primeira execucao — tudo e novo
const r1 = filtrarNaoAlertadas(db, pubsLote1, 'DOU');
assert(r1.novas.length === 2, 'lote inicial: 2 publicacoes sao novas');
assert(r1.jaAlertadas.length === 0, 'lote inicial: 0 ja alertadas');

// Marcar como alertadas (simulando e-mail enviado)
const n1 = marcarComoAlertadas(db, pubsLote1, contexto1, 'DOU');
assert(n1 === 2, 'marcou 2 publicacoes como alertadas');

// Teste 2: segunda execucao com mesmas publicacoes — tudo ja foi alertado
const r2 = filtrarNaoAlertadas(db, pubsLote1, 'DOU');
assert(r2.novas.length === 0, 'segunda execucao: 0 publicacoes novas');
assert(r2.jaAlertadas.length === 2, 'segunda execucao: 2 ja alertadas');

// Teste 3: lote misto — 1 nova + 1 ja vista
const pubsLote2 = [
  { classPK: 'PK-001', titulo: 'duplicada', data: '15/05/2026' },
  { classPK: 'PK-003', titulo: 'Embargo nova', data: '16/05/2026' },
];

const r3 = filtrarNaoAlertadas(db, pubsLote2, 'DOU');
assert(r3.novas.length === 1, 'lote misto: 1 nova');
assert(r3.jaAlertadas.length === 1, 'lote misto: 1 ja alertada');
assert(r3.novas[0].classPK === 'PK-003', 'a nova e PK-003');

// Teste 4: publicacao sem classPK passa pelo filtro (nao podemos deduplica-la)
const pubsSemPK = [{ classPK: '', titulo: 'sem id', data: '17/05/2026' }];
const r4 = filtrarNaoAlertadas(db, pubsSemPK, 'DOU');
assert(r4.novas.length === 1, 'publicacao sem classPK e tratada como nova');

// Teste 5: marcacao e idempotente — INSERT OR IGNORE nao duplica
const n5 = marcarComoAlertadas(db, pubsLote1, contexto1, 'DOU');
assert(n5 === 0, 'remarcar publicacoes ja existentes retorna 0 (nenhum INSERT efetivo)');

// Teste 6: contar
const totalGeral = contar(db);
assert(totalGeral === 2, `total geral no banco e 2 (encontrado: ${totalGeral})`);

const totalCetesb = contar(db, 'DOU', '43.776.491/0001-70');
assert(totalCetesb === 2, `total CETESB DOU e 2 (encontrado: ${totalCetesb})`);

// Teste 7: PK composta — mesmo classPK em fonte diferente nao colide
const pubsIBAMA = [{ classPK: 'PK-001', titulo: 'IBAMA mesma PK', data: '17/05/2026' }];
const r7 = filtrarNaoAlertadas(db, pubsIBAMA, 'IBAMA');
assert(r7.novas.length === 1, 'IBAMA: mesma PK que DOU mas em fonte diferente e nova');
marcarComoAlertadas(db, pubsIBAMA, { 'PK-001': { cnpj: 'x', empresa: 'y' } }, 'IBAMA');
const r7b = filtrarNaoAlertadas(db, pubsIBAMA, 'IBAMA');
assert(r7b.jaAlertadas.length === 1, 'IBAMA: apos marcar, mesma PK em IBAMA e ja alertada');
const r7c = filtrarNaoAlertadas(db, pubsLote1, 'DOU');
assert(r7c.jaAlertadas.length === 2, 'DOU: marcacao em IBAMA nao afetou DOU');

db.close();

// Limpa o banco de teste para nao contaminar o monitor real
if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
['-wal', '-shm'].forEach((suf) => {
  const f = DB_PATH + suf;
  if (fs.existsSync(f)) fs.unlinkSync(f);
});

console.log('\nTodos os testes passaram.');
