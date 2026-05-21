// Testes do painel web (painel.js).
// Cobrem as funcoes puras (normalizacao de relatorio legado, validacao de
// input) e a guarda de sessao. Nao sobem servidor nem fazem rede real, e
// nunca usam a senha real do painel.

const test = require('node:test');
const assert = require('node:assert');
const {
  normalizarRelatorio,
  validarCNPJ,
  validarNome,
  validarUF,
  exigirSessao,
} = require('./painel');

// --- Fixtures ---

// Relatorio legado da Fase 2: shape plano, sem a chave clientes[].
const relatorioLegado = {
  data: '15-05-2026',
  executadoEm: '2026-05-15T11:00:00.000Z',
  resultados: [
    {
      empresa: 'Empresa A',
      cnpj: '12.345.678/0001-00',
      totalEncontradas: 0,
      relevantes: [],
      jaAlertadas: [],
    },
  ],
  ibama: { autos: { novas: [], jaAlertadas: [], totalEncontradas: 0 } },
};

// Relatorio novo da Fase 3: ja tem clientes[].
const relatorioNovo = {
  data: '15-05-2026',
  executadoEm: '2026-05-21T15:47:03.831Z',
  clientes: [
    {
      clienteId: 'cli1',
      clienteNome: 'Cliente Um',
      resultados: [],
      ibama: {},
      diariosEstaduais: {},
    },
  ],
};

// --- normalizarRelatorio ---

test('normalizarRelatorio envolve relatorio legado num cliente default', () => {
  const norm = normalizarRelatorio(relatorioLegado);
  assert.strictEqual(Array.isArray(norm.clientes), true);
  assert.strictEqual(norm.clientes.length, 1);
  assert.strictEqual(norm.clientes[0].clienteId, 'default');
  assert.strictEqual(norm.clientes[0].clienteNome, 'Cliente Padrao');
  assert.deepStrictEqual(norm.clientes[0].resultados, relatorioLegado.resultados);
  assert.deepStrictEqual(norm.clientes[0].ibama, relatorioLegado.ibama);
  assert.strictEqual(norm.data, '15-05-2026');
  assert.strictEqual(norm.executadoEm, '2026-05-15T11:00:00.000Z');
});

test('normalizarRelatorio devolve relatorio novo (com clientes[]) sem alteracao', () => {
  const norm = normalizarRelatorio(relatorioNovo);
  assert.strictEqual(norm, relatorioNovo);
  assert.strictEqual(norm.clientes.length, 1);
  assert.strictEqual(norm.clientes[0].clienteId, 'cli1');
});

test('normalizarRelatorio trata relatorio legado sem resultados/ibama', () => {
  const norm = normalizarRelatorio({ data: '01-01-2026', executadoEm: 'x' });
  assert.strictEqual(norm.clientes.length, 1);
  assert.deepStrictEqual(norm.clientes[0].resultados, []);
  assert.deepStrictEqual(norm.clientes[0].ibama, {});
  assert.deepStrictEqual(norm.clientes[0].diariosEstaduais, {});
});

test('normalizarRelatorio nao quebra com null, undefined ou tipos invalidos', () => {
  assert.doesNotThrow(() => normalizarRelatorio(null));
  assert.doesNotThrow(() => normalizarRelatorio(undefined));
  assert.doesNotThrow(() => normalizarRelatorio('texto'));
  const norm = normalizarRelatorio(null);
  assert.strictEqual(norm.clientes[0].clienteId, 'default');
  assert.deepStrictEqual(norm.clientes[0].resultados, []);
});

// --- exigirSessao (guarda de sessao) ---

// Constroi um objeto res falso que registra para onde foi o redirect.
function resFalso() {
  return {
    redirecionadoPara: null,
    redirect(url) {
      this.redirecionadoPara = url;
    },
  };
}

test('exigirSessao sem sessao redireciona para /login e nao chama next', () => {
  const res = resFalso();
  let proximoChamado = false;
  exigirSessao({ session: undefined }, res, () => {
    proximoChamado = true;
  });
  assert.strictEqual(res.redirecionadoPara, '/login');
  assert.strictEqual(proximoChamado, false);
});

test('exigirSessao com sessao nao autenticada redireciona para /login', () => {
  const res = resFalso();
  let proximoChamado = false;
  exigirSessao({ session: { autenticado: false } }, res, () => {
    proximoChamado = true;
  });
  assert.strictEqual(res.redirecionadoPara, '/login');
  assert.strictEqual(proximoChamado, false);
});

test('exigirSessao com sessao autenticada chama next sem redirecionar', () => {
  const res = resFalso();
  let proximoChamado = false;
  exigirSessao({ session: { autenticado: true } }, res, () => {
    proximoChamado = true;
  });
  assert.strictEqual(res.redirecionadoPara, null);
  assert.strictEqual(proximoChamado, true);
});

// --- validarCNPJ ---

test('validarCNPJ aceita CNPJ valido com e sem mascara', () => {
  assert.strictEqual(validarCNPJ('43.776.491/0001-70'), true);
  assert.strictEqual(validarCNPJ('43776491000170'), true);
  assert.strictEqual(validarCNPJ('16.458.199/0001-36'), true);
});

test('validarCNPJ rejeita CNPJ invalido', () => {
  // Digito verificador errado.
  assert.strictEqual(validarCNPJ('43.776.491/0001-71'), false);
  // Quantidade de digitos errada.
  assert.strictEqual(validarCNPJ('123'), false);
  // Sequencia de um digito so.
  assert.strictEqual(validarCNPJ('00.000.000/0000-00'), false);
  // Vazio, nulo e tipo nao-string.
  assert.strictEqual(validarCNPJ(''), false);
  assert.strictEqual(validarCNPJ(null), false);
  assert.strictEqual(validarCNPJ(43776491000170), false);
});

// --- validarNome ---

test('validarNome aceita nome valido e rejeita vazio ou nao-string', () => {
  assert.strictEqual(validarNome('Empresa Boa Ltda'), true);
  assert.strictEqual(validarNome('  '), false);
  assert.strictEqual(validarNome('A'), false);
  assert.strictEqual(validarNome(123), false);
  assert.strictEqual(validarNome(undefined), false);
});

// --- validarUF ---

test('validarUF aceita UF valida, aceita vazia (opcional) e rejeita invalida', () => {
  assert.strictEqual(validarUF('SP'), true);
  assert.strictEqual(validarUF('sp'), true);
  assert.strictEqual(validarUF(''), true);
  assert.strictEqual(validarUF(undefined), true);
  assert.strictEqual(validarUF('XX'), false);
  assert.strictEqual(validarUF('Brasil'), false);
  assert.strictEqual(validarUF(99), false);
});
