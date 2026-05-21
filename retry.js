// Helper de retentativa com espera exponencial (backoff).
// Reexecuta uma funcao assincrona ate ela ter sucesso ou esgotar as tentativas.
// Serve para tolerar falhas transitorias de rede — ex: a busca no DOU, que
// as vezes falha por timeout mas funciona numa segunda tentativa.

// Executa `fn` ate `tentativas` vezes. Entre uma falha e a tentativa seguinte
// espera um tempo que dobra a cada rodada: esperaBaseMs, 2x, 4x...
// Se todas as tentativas falharem, relanca o ultimo erro capturado.
//
// opcoes.tentativas    numero maximo de execucoes (padrao 3)
// opcoes.esperaBaseMs  espera antes da 2a tentativa, em ms (padrao 2000)
// opcoes.aoFalhar      callback (erro, tentativa, esperaMs) a cada falha
//                      intermediaria — util para avisar no console/log
async function comRetentativa(fn, opcoes = {}) {
  const tentativas = opcoes.tentativas || 3;
  const esperaBaseMs = opcoes.esperaBaseMs != null ? opcoes.esperaBaseMs : 2000;
  const aoFalhar = opcoes.aoFalhar || null;

  let ultimoErro;
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      return await fn(tentativa);
    } catch (erro) {
      ultimoErro = erro;
      if (tentativa < tentativas) {
        const espera = esperaBaseMs * Math.pow(2, tentativa - 1);
        if (aoFalhar) aoFalhar(erro, tentativa, espera);
        if (espera > 0) {
          await new Promise((resolve) => setTimeout(resolve, espera));
        }
      }
    }
  }

  throw ultimoErro;
}

module.exports = { comRetentativa };
