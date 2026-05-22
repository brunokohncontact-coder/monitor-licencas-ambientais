// Testes do modulo de autoteste (autoteste.js).
// montarResultado e uma funcao PURA: recebe resultados de probes e devolve
// linhas formatadas + flag de falha. executarProbes e testada com probes
// mockados — sem rede, sem navegador.

const test = require('node:test');
const assert = require('node:assert');
const { montarResultado, executarProbes } = require('./autoteste');

// ─── montarResultado ──────────────────────────────────────────────────────────

test('montarResultado: todas as fontes ok — nenhuma falhou', () => {
  const resultados = {
    dou: { ok: true },
    ibama: { ok: true },
    doesp: { ok: true },
    resend: { ok: true },
  };

  const { linhas, algumFalhou } = montarResultado(resultados);

  assert.strictEqual(algumFalhou, false);
  assert.strictEqual(linhas.length, 4);
  assert.ok(linhas.every((l) => l.includes(': OK')), 'todas as linhas devem terminar com OK');
});

test('montarResultado: uma fonte falhou — algumFalhou e true', () => {
  const resultados = {
    dou: { ok: true },
    ibama: { ok: false, motivo: 'HTTP 503' },
    doesp: { ok: true },
    resend: { ok: true },
  };

  const { linhas, algumFalhou } = montarResultado(resultados);

  assert.strictEqual(algumFalhou, true);
  const linhaIBAMA = linhas.find((l) => l.startsWith('IBAMA'));
  assert.ok(linhaIBAMA, 'deve haver linha para o IBAMA');
  assert.ok(linhaIBAMA.includes('FALHOU'), 'linha do IBAMA deve indicar falha');
  assert.ok(linhaIBAMA.includes('HTTP 503'), 'linha do IBAMA deve citar o motivo');
});

test('montarResultado: motivo ausente exibe texto padrao', () => {
  const resultados = {
    dou: { ok: false },
    ibama: { ok: true },
    doesp: { ok: true },
    resend: { ok: true },
  };

  const { linhas, algumFalhou } = montarResultado(resultados);

  assert.strictEqual(algumFalhou, true);
  const linhaDOU = linhas.find((l) => l.startsWith('DOU'));
  assert.ok(linhaDOU.includes('erro desconhecido'), 'motivo ausente deve usar texto padrao');
});

test('montarResultado: nomes de exibicao corretos por fonte', () => {
  const resultados = {
    dou: { ok: true },
    ibama: { ok: true },
    doesp: { ok: true },
    resend: { ok: true },
  };

  const { linhas } = montarResultado(resultados);
  const nomes = linhas.map((l) => l.split(':')[0]);

  assert.ok(nomes.includes('DOU'), 'deve haver linha DOU');
  assert.ok(nomes.includes('IBAMA'), 'deve haver linha IBAMA');
  assert.ok(nomes.includes('DOESP'), 'deve haver linha DOESP');
  assert.ok(nomes.includes('Resend'), 'deve haver linha Resend');
});

// ─── executarProbes com mocks ────────────────────────────────────────────────

test('executarProbes: todas as fontes respondem — resultados ok', async () => {
  const probesMock = {
    abrirBrowser: async () => ({ close: async () => {} }),
    buscarDOU: async () => ({ publicacoes: [] }),
    probeHttp: async () => ({ ok: true, status: 200 }),
    buscarDOESP: async () => ({ publicacoes: [], totalResultados: 0 }),
    resendApiKey: 're_chave_valida',
  };

  const resultados = await executarProbes(probesMock);

  assert.strictEqual(resultados.dou.ok, true, 'DOU deve estar ok');
  assert.strictEqual(resultados.ibama.ok, true, 'IBAMA deve estar ok');
  assert.strictEqual(resultados.doesp.ok, true, 'DOESP deve estar ok');
  assert.strictEqual(resultados.resend.ok, true, 'Resend deve estar ok');
});

test('executarProbes: DOU falha — resultado registra o motivo', async () => {
  const probesMock = {
    abrirBrowser: async () => ({ close: async () => {} }),
    buscarDOU: async () => { throw new Error('timeout ao abrir o DOU'); },
    probeHttp: async () => ({ ok: true, status: 200 }),
    buscarDOESP: async () => ({ publicacoes: [], totalResultados: 0 }),
    resendApiKey: 're_chave_valida',
  };

  const resultados = await executarProbes(probesMock);

  assert.strictEqual(resultados.dou.ok, false, 'DOU deve ter falhado');
  assert.ok(resultados.dou.motivo.includes('timeout'), 'motivo deve citar a causa');
  // As outras fontes nao sao afetadas pela falha do DOU.
  assert.strictEqual(resultados.ibama.ok, true);
  assert.strictEqual(resultados.doesp.ok, true);
  assert.strictEqual(resultados.resend.ok, true);
});

test('executarProbes: Resend sem chave — resultado indica nao configurado', async () => {
  const probesMock = {
    abrirBrowser: async () => ({ close: async () => {} }),
    buscarDOU: async () => ({ publicacoes: [] }),
    probeHttp: async () => ({ ok: true, status: 200 }),
    buscarDOESP: async () => ({ publicacoes: [], totalResultados: 0 }),
    resendApiKey: '',
  };

  const resultados = await executarProbes(probesMock);

  assert.strictEqual(resultados.resend.ok, false, 'Resend sem chave deve falhar');
  assert.ok(
    resultados.resend.motivo.includes('nao configurada'),
    'motivo deve indicar ausencia de chave'
  );
});
