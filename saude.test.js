// Testes do modulo de saude (saude.js).
// calcularSaude e uma funcao PURA: recebe um relatorio e devolve o resumo de
// saude. Os testes exercitam o caso saudavel, casos com falha de fonte e o
// caso de DOU parcial — tudo com fixtures em memoria, sem rede.

const test = require('node:test');
const assert = require('node:assert');
const { calcularSaude } = require('./saude');

// --- Caso saudavel: nenhuma falha, nenhum parcial ---------------------------

test('calcularSaude: execucao sem falhas tem status "ok"', () => {
  const relatorio = {
    data: '15-05-2026',
    executadoEm: '2026-05-15T11:00:00.000Z',
    clientes: [
      {
        clienteId: 'cli1',
        clienteNome: 'Cliente Um',
        resultados: [
          { empresa: 'Empresa A', cnpj: '1', totalEncontradas: 0, relevantes: [], jaAlertadas: [], todas: [] },
          { empresa: 'Empresa B', cnpj: '2', totalEncontradas: 2, relevantes: [], jaAlertadas: [], todas: [] },
        ],
        ibama: {
          autos: { novas: [], jaAlertadas: [], totalEncontradas: 0 },
          embargos: { novas: [], jaAlertadas: [], totalEncontradas: 0 },
        },
        diariosEstaduais: {
          SP: { fonte: 'DOESP', nome: 'Diario SP', novas: [], jaAlertadas: [], totalEncontradas: 0 },
        },
      },
    ],
  };

  const saude = calcularSaude(relatorio);

  assert.strictEqual(saude.status, 'ok');
  assert.deepStrictEqual(saude.fontes.dou, { ok: 2, parcial: 0, falha: 0 });
  assert.deepStrictEqual(saude.fontes.ibama, { ok: 2, falha: 0 });
  assert.deepStrictEqual(saude.fontes.diarios, { ok: 1, falha: 0 });
  assert.deepStrictEqual(saude.falhas, []);
});

// --- Caso com falha de fonte ------------------------------------------------

test('calcularSaude: falha de fonte vira status "parcial" e entra em falhas[]', () => {
  const relatorio = {
    data: '15-05-2026',
    executadoEm: '2026-05-15T11:00:00.000Z',
    clientes: [
      {
        clienteId: 'cli1',
        clienteNome: 'Cliente Padrao',
        resultados: [
          { empresa: 'CETESB', cnpj: '1', totalEncontradas: 0, relevantes: [], jaAlertadas: [], todas: [], erro: 'timeout' },
          { empresa: 'Outra', cnpj: '2', totalEncontradas: 1, relevantes: [], jaAlertadas: [], todas: [] },
        ],
        ibama: {
          autos: { novas: [], jaAlertadas: [], erro: 'HTTP 503' },
          embargos: { novas: [], jaAlertadas: [], totalEncontradas: 0 },
        },
        diariosEstaduais: {
          SP: { fonte: 'DOESP', nome: 'Diario SP', novas: [], jaAlertadas: [], erro: 'JSON invalido' },
        },
      },
    ],
  };

  const saude = calcularSaude(relatorio);

  assert.strictEqual(saude.status, 'parcial');
  assert.deepStrictEqual(saude.fontes.dou, { ok: 1, parcial: 0, falha: 1 });
  assert.deepStrictEqual(saude.fontes.ibama, { ok: 1, falha: 1 });
  assert.deepStrictEqual(saude.fontes.diarios, { ok: 0, falha: 1 });
  assert.strictEqual(saude.falhas.length, 3);
  // As descricoes sao legiveis e citam fonte, contexto e o erro.
  assert.ok(
    saude.falhas.some((f) => f.includes('DOU') && f.includes('CETESB') && f.includes('timeout')),
    'falha do DOU deve citar empresa e motivo'
  );
  assert.ok(
    saude.falhas.some((f) => f.includes('IBAMA') && f.includes('autos') && f.includes('HTTP 503')),
    'falha do IBAMA deve citar a fonte e o motivo'
  );
  assert.ok(
    saude.falhas.some((f) => f.includes('Diario estadual') && f.includes('JSON invalido')),
    'falha do diario deve citar o motivo'
  );
});

// --- Caso com DOU parcial (perda de paginas) --------------------------------

test('calcularSaude: DOU parcial entra em fontes.dou.parcial e status vira "parcial"', () => {
  const relatorio = {
    data: '15-05-2026',
    executadoEm: '2026-05-15T11:00:00.000Z',
    clientes: [
      {
        clienteId: 'cli1',
        clienteNome: 'Cliente Um',
        resultados: [
          {
            empresa: 'Empresa Parcial',
            cnpj: '1',
            totalEncontradas: 75,
            relevantes: [],
            jaAlertadas: [],
            todas: [],
            parcial: true,
            aviso: 'Pagina 2 do DOU falhou apos 3 tentativas',
          },
          { empresa: 'Empresa Ok', cnpj: '2', totalEncontradas: 1, relevantes: [], jaAlertadas: [], todas: [] },
        ],
        ibama: {},
        diariosEstaduais: {},
      },
    ],
  };

  const saude = calcularSaude(relatorio);

  assert.strictEqual(saude.status, 'parcial');
  assert.deepStrictEqual(saude.fontes.dou, { ok: 1, parcial: 1, falha: 0 });
  assert.strictEqual(saude.falhas.length, 1);
  assert.ok(
    saude.falhas[0].includes('Empresa Parcial') && saude.falhas[0].includes('Pagina 2'),
    'a falha do DOU parcial deve reaproveitar o texto do aviso'
  );
});

// --- Cliente inteiro com erro -----------------------------------------------

test('calcularSaude: cliente inteiro com erro entra em falhas[] e vira "parcial"', () => {
  const relatorio = {
    data: '15-05-2026',
    executadoEm: '2026-05-15T11:00:00.000Z',
    clientes: [
      {
        clienteId: 'cli1',
        clienteNome: 'Cliente Quebrado',
        resultados: [],
        ibama: {},
        diariosEstaduais: {},
        erro: 'Falha geral ao processar o cliente',
      },
    ],
  };

  const saude = calcularSaude(relatorio);

  assert.strictEqual(saude.status, 'parcial');
  assert.strictEqual(saude.falhas.length, 1);
  assert.ok(saude.falhas[0].includes('Cliente Quebrado'));
});

// --- Multiplos clientes: contagens sao somadas ------------------------------

test('calcularSaude: contagens sao somadas sobre todos os clientes', () => {
  const relatorio = {
    data: '15-05-2026',
    executadoEm: '2026-05-15T11:00:00.000Z',
    clientes: [
      {
        clienteId: 'a',
        clienteNome: 'Cliente A',
        resultados: [{ empresa: 'E1', cnpj: '1', totalEncontradas: 0, relevantes: [], jaAlertadas: [], todas: [] }],
        ibama: { autos: { novas: [], jaAlertadas: [], totalEncontradas: 0 } },
        diariosEstaduais: {},
      },
      {
        clienteId: 'b',
        clienteNome: 'Cliente B',
        resultados: [{ empresa: 'E2', cnpj: '2', totalEncontradas: 0, relevantes: [], jaAlertadas: [], todas: [], erro: 'erro x' }],
        ibama: { autos: { novas: [], jaAlertadas: [], totalEncontradas: 0 } },
        diariosEstaduais: {},
      },
    ],
  };

  const saude = calcularSaude(relatorio);

  // 2 buscas DOU no total: 1 ok (cliente A) + 1 falha (cliente B).
  assert.deepStrictEqual(saude.fontes.dou, { ok: 1, parcial: 0, falha: 1 });
  // 2 fontes IBAMA no total: 1 por cliente, ambas ok.
  assert.deepStrictEqual(saude.fontes.ibama, { ok: 2, falha: 0 });
  assert.strictEqual(saude.status, 'parcial');
});

// --- Robustez: entrada ausente ou invalida ----------------------------------

test('calcularSaude: relatorio ausente ou invalido nao quebra e devolve "ok" vazio', () => {
  for (const entrada of [null, undefined, 'texto', 42, {}]) {
    const saude = calcularSaude(entrada);
    assert.strictEqual(saude.status, 'ok');
    assert.deepStrictEqual(saude.fontes.dou, { ok: 0, parcial: 0, falha: 0 });
    assert.deepStrictEqual(saude.fontes.ibama, { ok: 0, falha: 0 });
    assert.deepStrictEqual(saude.fontes.diarios, { ok: 0, falha: 0 });
    assert.deepStrictEqual(saude.falhas, []);
  }
});

// --- Relatorio sem clientes[] (vazio) ---------------------------------------

test('calcularSaude: relatorio com clientes[] vazio tem status "ok"', () => {
  const saude = calcularSaude({ data: '15-05-2026', clientes: [] });
  assert.strictEqual(saude.status, 'ok');
  assert.deepStrictEqual(saude.falhas, []);
});
