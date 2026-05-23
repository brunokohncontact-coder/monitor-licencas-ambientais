// Testes do modulo classificador.js.
// Cobre os 6 cenarios principais da spec (AI_PROMPT.md:316-323).
// Funcao pura — sem I/O, sem rede.

const test = require('node:test');
const assert = require('node:assert');
const { classificarPublicacao } = require('./classificador');

// Cenario 1: Auto de infracao -> gravidade alta, prazo comeca com "20 dias"
test('auto de infracao: gravidade alta com prazo de 20 dias', () => {
  const r = classificarPublicacao({
    tipo: 'Auto de Infração',
    titulo: 'IBAMA autua empresa por desmatamento',
    resumo: 'Auto de infracao ambiental n. 123456'
  });
  assert.strictEqual(r.gravidade, 'alta');
  assert.ok(r.prazo.startsWith('20 dias'), `prazo deve comecar com "20 dias", mas foi: "${r.prazo}"`);
});

// Cenario 2: Embargo -> gravidade critica
test('embargo: gravidade critica', () => {
  const r = classificarPublicacao({
    tipo: 'Despacho',
    titulo: 'embargo de area',
    resumo: ''
  });
  assert.strictEqual(r.gravidade, 'critica');
});

// Cenario 3: Renovacao de licenca -> gravidade media
test('renovacao de licenca: gravidade media', () => {
  const r = classificarPublicacao({
    tipo: 'Aviso',
    titulo: 'renovacao de licenca LO',
    resumo: ''
  });
  assert.strictEqual(r.gravidade, 'media');
});

// Cenario 4: Licenca concedida -> gravidade baixa
test('licenca concedida: gravidade baixa', () => {
  const r = classificarPublicacao({
    tipo: 'Aviso',
    titulo: 'licenca concedida para empresa X',
    resumo: ''
  });
  assert.strictEqual(r.gravidade, 'baixa');
});

// Cenario 5: Publicacao generica sem palavras-chave -> fallback baixa
test('publicacao generica sem palavras-chave: fallback gravidade baixa', () => {
  const r = classificarPublicacao({
    tipo: 'Aviso',
    titulo: 'comunicado generico sobre reuniao',
    resumo: ''
  });
  assert.strictEqual(r.gravidade, 'baixa');
});

// Cenario 6: Case-insensitive + ignora acento
test('case-insensitive e ignora acento: AUTO DE INFRACAO -> alta', () => {
  const r1 = classificarPublicacao({
    tipo: 'AUTO DE INFRAÇÃO',
    titulo: '',
    resumo: ''
  });
  assert.strictEqual(r1.gravidade, 'alta');

  const r2 = classificarPublicacao({
    tipo: 'Auto de infracao',
    titulo: '',
    resumo: ''
  });
  assert.strictEqual(r2.gravidade, 'alta');
});

// Cenario extra: todos os campos do retorno sao strings nao-vazias em todos os casos
test('shape completo: todos os 4 campos sao strings nao-vazias', () => {
  const casos = [
    { tipo: 'Despacho', titulo: 'embargo', resumo: '' },
    { tipo: 'Auto de Infração', titulo: 'autuacao', resumo: '' },
    { tipo: 'Aviso', titulo: 'notificacao ambiental', resumo: '' },
    { tipo: 'Aviso', titulo: 'renovacao de licenca', resumo: '' },
    { tipo: 'Aviso', titulo: 'exigencia complementar', resumo: '' },
    { tipo: 'Portaria', titulo: 'nova norma', resumo: '' },
    { tipo: 'Aviso', titulo: 'licenca concedida', resumo: '' },
    { tipo: 'Aviso', titulo: 'comunicado qualquer', resumo: '' }
  ];
  for (const pub of casos) {
    const r = classificarPublicacao(pub);
    for (const campo of ['gravidade', 'prazo', 'acao', 'explicacao']) {
      assert.strictEqual(typeof r[campo], 'string', `campo ${campo} deve ser string para pub: ${JSON.stringify(pub)}`);
      assert.ok(r[campo].length > 0, `campo ${campo} nao deve ser vazio para pub: ${JSON.stringify(pub)}`);
    }
  }
});
