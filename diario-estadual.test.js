// Testes do modulo de diarios estaduais (diario-estadual.js).
// A normalizacao das publicacoes do DOESP e exercitada pela fixture
// fixtures/doesp-amostra.html — uma resposta JSON real capturada do endpoint
// de busca do portal. Nenhum teste faz rede real: a paginacao de buscarDOESP
// e testada com um fetcher injetado (opcoes._buscarPagina).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {
  DIARIOS,
  ufsParaVarrer,
  normalizarPublicacaoDOESP,
  buscarDOESP,
} = require('./diario-estadual');

// A fixture e o JSON capturado do DOESP, guardado sob o nome .html exigido
// pelo contrato da TASK5 (o conteudo e JSON — o portal e uma API JSON).
const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'doesp-amostra.html'), 'utf-8')
);

// --- normalizacao das publicacoes -----------------------------------------

test('normalizarPublicacaoDOESP produz o shape normalizado do DOU', () => {
  const pub = normalizarPublicacaoDOESP(fixture.items[0]);
  for (const campo of [
    'tipo',
    'secao',
    'orgaos',
    'orgaoStr',
    'edicao',
    'pagina',
    'titulo',
    'data',
    'link',
    'resumo',
    'classPK',
  ]) {
    assert.ok(campo in pub, `campo "${campo}" presente no shape normalizado`);
  }
  assert.strictEqual(typeof pub.tipo, 'string');
  assert.strictEqual(typeof pub.titulo, 'string');
  assert.strictEqual(typeof pub.resumo, 'string');
  assert.ok(Array.isArray(pub.orgaos), 'orgaos e um array');
});

test('normalizarPublicacaoDOESP converte a data ISO para dd/MM/aaaa', () => {
  const pub = normalizarPublicacaoDOESP(fixture.items[0]);
  assert.match(pub.data, /^\d{2}\/\d{2}\/\d{4}$/);
  assert.strictEqual(pub.data, '07/05/2026');
});

test('normalizarPublicacaoDOESP monta o link a partir do slug', () => {
  const item = fixture.items[0];
  const pub = normalizarPublicacaoDOESP(item);
  assert.ok(pub.link.startsWith('https://doe.sp.gov.br/'));
  assert.ok(pub.link.endsWith(item.slug), 'o link termina com o slug do item');
});

test('normalizarPublicacaoDOESP usa o id da publicacao como classPK', () => {
  const item = fixture.items[0];
  const pub = normalizarPublicacaoDOESP(item);
  assert.strictEqual(pub.classPK, item.id);
  assert.ok(pub.classPK.length > 0);
});

test('normalizarPublicacaoDOESP deriva o tipo da primeira palavra do titulo', () => {
  const pub = normalizarPublicacaoDOESP(fixture.items[0]);
  // titulo "PORTARIA SMA, DE 05 DE MAIO DE 2026" -> tipo "PORTARIA"
  assert.strictEqual(pub.tipo, 'PORTARIA');
});

test('normalizarPublicacaoDOESP nao quebra com item vazio ou nulo', () => {
  for (const entrada of [{}, null, undefined]) {
    const pub = normalizarPublicacaoDOESP(entrada);
    assert.strictEqual(pub.titulo, '');
    assert.strictEqual(pub.classPK, '');
    assert.strictEqual(pub.data, '');
    assert.strictEqual(pub.resumo, '');
    assert.deepStrictEqual(pub.orgaos, []);
  }
});

test('toda a fixture normaliza para o shape esperado', () => {
  const pubs = fixture.items.map(normalizarPublicacaoDOESP);
  assert.strictEqual(pubs.length, fixture.items.length);
  for (const p of pubs) {
    assert.strictEqual(typeof p.tipo, 'string');
    assert.ok(p.classPK.length > 0, 'classPK preenchido');
    assert.match(p.data, /^\d{2}\/\d{2}\/\d{4}$/);
    assert.ok(p.link.startsWith('https://doe.sp.gov.br/'));
  }
});

// --- buscarDOESP com fetcher injetado (sem rede) --------------------------

test('buscarDOESP normaliza os itens e devolve o total de resultados', async () => {
  const fakeFetch = async () => ({ ...fixture, hasNextPage: false });
  const r = await buscarDOESP('43.776.491/0001-70', { _buscarPagina: fakeFetch });
  assert.strictEqual(r.publicacoes.length, fixture.items.length);
  assert.strictEqual(r.totalResultados, fixture.totalItems);
  assert.match(r.publicacoes[0].data, /^\d{2}\/\d{2}\/\d{4}$/);
});

test('buscarDOESP para na primeira pagina quando hasNextPage e false', async () => {
  let chamadas = 0;
  const fakeFetch = async () => {
    chamadas++;
    return { ...fixture, hasNextPage: false };
  };
  await buscarDOESP('termo', { _buscarPagina: fakeFetch, maxPaginas: 5 });
  assert.strictEqual(chamadas, 1);
});

test('buscarDOESP respeita o limite maxPaginas mesmo com hasNextPage true', async () => {
  let chamadas = 0;
  const fakeFetch = async () => {
    chamadas++;
    return { ...fixture, hasNextPage: true };
  };
  await buscarDOESP('termo', { _buscarPagina: fakeFetch, maxPaginas: 2 });
  assert.strictEqual(chamadas, 2, 'nao ultrapassa maxPaginas');
});

test('buscarDOESP nao quebra quando a resposta nao tem items', async () => {
  const fakeFetch = async () => ({ items: [], totalItems: 0, hasNextPage: false });
  const r = await buscarDOESP('termo', { _buscarPagina: fakeFetch });
  assert.deepStrictEqual(r.publicacoes, []);
  assert.strictEqual(r.totalResultados, 0);
});

// --- registry DIARIOS por UF ----------------------------------------------

test('DIARIOS tem uma entrada SP no padrao do registry', () => {
  assert.ok(DIARIOS.SP, 'UF SP registrada');
  assert.strictEqual(DIARIOS.SP.uf, 'SP');
  assert.strictEqual(DIARIOS.SP.fonte, 'DOESP');
  assert.strictEqual(typeof DIARIOS.SP.buscar, 'function');
});

test('UF sem diario implementado nao tem entrada no registry (pulo gracioso)', () => {
  // RJ nao e implementado nesta fase: DIARIOS.RJ e undefined e o
  // monitor.js trata isso como pulo com aviso, sem lancar erro.
  assert.strictEqual(DIARIOS.RJ, undefined);
});

// --- resolucao de UFs a varrer --------------------------------------------

test('ufsParaVarrer faz a uniao das UFs das empresas ativas', () => {
  const empresas = [{ uf: 'SP' }, { uf: 'RJ' }, { uf: 'sp' }];
  const ufs = ufsParaVarrer(empresas, null).sort();
  assert.deepStrictEqual(ufs, ['RJ', 'SP']);
});

test('ufsParaVarrer: a lista estados sobrepoe as UFs das empresas', () => {
  const empresas = [{ uf: 'SP' }, { uf: 'RJ' }];
  const ufs = ufsParaVarrer(empresas, ['SP']);
  assert.deepStrictEqual(ufs, ['SP'], 'o override restringe a varredura a SP');
});

test('ufsParaVarrer ignora empresas sem uf e normaliza para maiusculas', () => {
  const ufs = ufsParaVarrer([{ uf: '' }, { nome: 'sem uf' }, { uf: ' mg ' }], null);
  assert.deepStrictEqual(ufs, ['MG']);
});

test('ufsParaVarrer devolve lista vazia sem empresas e sem override', () => {
  assert.deepStrictEqual(ufsParaVarrer([], null), []);
  assert.deepStrictEqual(ufsParaVarrer(undefined, undefined), []);
});
