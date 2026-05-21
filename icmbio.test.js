// Testes do modulo icmbio.js — a funcao pura categorizarOrgao.
// categorizarOrgao classifica o orgao emissor de uma publicacao do DOU.
// Por ser pura (sem rede, sem estado), os testes sao deterministicos e
// nao precisam de mock: bastam objetos de publicacao montados a mao.

const test = require('node:test');
const assert = require('node:assert');
const { categorizarOrgao, CATEGORIA_ICMBIO } = require('./icmbio');

// --- happy path: orgao indica o ICMBio ------------------------------------

test('categorizarOrgao retorna ICMBio quando orgaoStr traz a sigla', () => {
  const pub = {
    orgaoStr:
      'Ministerio do Meio Ambiente/Instituto Chico Mendes de Conservacao da Biodiversidade - ICMBio',
  };
  assert.strictEqual(categorizarOrgao(pub), 'ICMBio');
});

test('categorizarOrgao retorna ICMBio quando orgaoStr traz o nome por extenso', () => {
  const pub = {
    orgaoStr: 'Ministerio do Meio Ambiente/Instituto Chico Mendes de Conservacao da Biodiversidade',
  };
  assert.strictEqual(categorizarOrgao(pub), 'ICMBio');
});

test('categorizarOrgao detecta o ICMBio pelo array orgaos quando orgaoStr esta vazio', () => {
  const pub = {
    orgaoStr: '',
    orgaos: ['Ministerio do Meio Ambiente', 'Instituto Chico Mendes de Conservacao da Biodiversidade'],
  };
  assert.strictEqual(categorizarOrgao(pub), 'ICMBio');
});

test('categorizarOrgao e insensivel a maiusculas/minusculas', () => {
  assert.strictEqual(categorizarOrgao({ orgaoStr: 'ICMBIO' }), 'ICMBio');
  assert.strictEqual(categorizarOrgao({ orgaoStr: 'icmbio' }), 'ICMBio');
  assert.strictEqual(
    categorizarOrgao({ orgaoStr: 'INSTITUTO CHICO MENDES de conservacao' }),
    'ICMBio'
  );
});

test('a categoria retornada e igual a constante exportada CATEGORIA_ICMBIO', () => {
  assert.strictEqual(categorizarOrgao({ orgaoStr: 'icmbio' }), CATEGORIA_ICMBIO);
});

// --- casos de borda: orgao nao indica o ICMBio ----------------------------

test('categorizarOrgao retorna null para orgao do IBAMA', () => {
  const pub = {
    orgaoStr:
      'Ministerio do Meio Ambiente/Instituto Brasileiro do Meio Ambiente e dos Recursos Naturais Renovaveis',
  };
  assert.strictEqual(categorizarOrgao(pub), null);
});

test('categorizarOrgao retorna null para orgao desconhecido', () => {
  const pub = { orgaoStr: 'Ministerio da Fazenda/Secretaria do Tesouro Nacional' };
  assert.strictEqual(categorizarOrgao(pub), null);
});

test('categorizarOrgao retorna null quando o orgao esta vazio', () => {
  assert.strictEqual(categorizarOrgao({ orgaoStr: '' }), null);
  assert.strictEqual(categorizarOrgao({ orgaoStr: '', orgaos: [] }), null);
});

test('categorizarOrgao retorna null para publicacao sem campos de orgao', () => {
  assert.strictEqual(categorizarOrgao({}), null);
});

// --- casos de borda: entradas invalidas -----------------------------------

test('categorizarOrgao nao quebra com null, undefined ou tipos invalidos', () => {
  for (const entrada of [null, undefined, 'icmbio', 42, []]) {
    assert.strictEqual(categorizarOrgao(entrada), null);
  }
});

test('categorizarOrgao ignora orgaos quando nao e um array', () => {
  // orgaos com tipo inesperado nao deve quebrar nem provocar falso positivo.
  const pub = { orgaoStr: 'Ministerio da Saude', orgaos: 'instituto chico mendes' };
  assert.strictEqual(categorizarOrgao(pub), null);
});

// --- pureza: mesma entrada -> mesma saida, sem mutacao ---------------------

test('categorizarOrgao e pura: mesma entrada produz sempre a mesma saida', () => {
  const pub = { orgaoStr: 'Instituto Chico Mendes de Conservacao da Biodiversidade' };
  const r1 = categorizarOrgao(pub);
  const r2 = categorizarOrgao(pub);
  assert.strictEqual(r1, r2);
  assert.strictEqual(r1, 'ICMBio');
});

test('categorizarOrgao nao altera a publicacao recebida', () => {
  const pub = { orgaoStr: 'icmbio', orgaos: ['ICMBio'] };
  const antes = JSON.stringify(pub);
  categorizarOrgao(pub);
  assert.strictEqual(JSON.stringify(pub), antes, 'a publicacao de entrada permanece intacta');
});
