// Testes do filtro de relevancia (ehRelevante, exportado por monitor.js).

const test = require('node:test');
const assert = require('node:assert');
const { ehRelevante } = require('./monitor');

// Config de filtro fixa, injetada para o teste nao depender do config.json real.
const cfg = {
  filtro: {
    tiposRelevantes: ['Licenca', 'Portaria'],
    palavrasChaveTitulo: ['ambiental', 'licenca'],
  },
};

// Monta uma publicacao com os campos vazios por padrao.
function pub(campos) {
  return { tipo: '', titulo: '', resumo: '', ...campos };
}

test('relevante quando o tipo esta na lista de tipos', () => {
  assert.strictEqual(ehRelevante(pub({ tipo: 'Portaria' }), cfg), true);
});

test('relevante quando ha palavra-chave no titulo', () => {
  assert.strictEqual(
    ehRelevante(pub({ titulo: 'Renovacao de licenca de operacao' }), cfg),
    true
  );
});

test('relevante quando ha palavra-chave no resumo', () => {
  assert.strictEqual(
    ehRelevante(pub({ resumo: 'trata de questao ambiental relevante' }), cfg),
    true
  );
});

test('nao relevante quando tipo e texto nao batem com o filtro', () => {
  assert.strictEqual(
    ehRelevante(pub({ tipo: 'Extrato', titulo: 'Contrato de prestacao de servico' }), cfg),
    false
  );
});
