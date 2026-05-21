// Testes do helper de retentativa (retry.js).

const test = require('node:test');
const assert = require('node:assert');
const { comRetentativa } = require('./retry');

test('sucesso na primeira tentativa nao reexecuta a funcao', async () => {
  let chamadas = 0;
  const resultado = await comRetentativa(
    async () => {
      chamadas++;
      return 'ok';
    },
    { esperaBaseMs: 0 }
  );
  assert.strictEqual(resultado, 'ok');
  assert.strictEqual(chamadas, 1);
});

test('tem sucesso apos algumas falhas transitorias', async () => {
  let chamadas = 0;
  const resultado = await comRetentativa(
    async () => {
      chamadas++;
      if (chamadas < 3) throw new Error('falha transitoria');
      return 'ok';
    },
    { tentativas: 3, esperaBaseMs: 0 }
  );
  assert.strictEqual(resultado, 'ok');
  assert.strictEqual(chamadas, 3);
});

test('relanca o ultimo erro ao esgotar as tentativas', async () => {
  let chamadas = 0;
  await assert.rejects(
    () =>
      comRetentativa(
        async () => {
          chamadas++;
          throw new Error(`falha numero ${chamadas}`);
        },
        { tentativas: 3, esperaBaseMs: 0 }
      ),
    /falha numero 3/
  );
  assert.strictEqual(chamadas, 3);
});

test('espera entre tentativas cresce com backoff exponencial', async () => {
  const esperas = [];
  await assert.rejects(() =>
    comRetentativa(
      async () => {
        throw new Error('x');
      },
      {
        tentativas: 3,
        esperaBaseMs: 10,
        aoFalhar: (erro, tentativa, espera) => esperas.push(espera),
      }
    )
  );
  // Espera antes da 2a tentativa = 10, antes da 3a = 20 (dobra a cada rodada).
  assert.deepStrictEqual(esperas, [10, 20]);
});
