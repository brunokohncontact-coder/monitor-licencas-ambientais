// Modulo de saude — auto-diagnostico da execucao do monitor.
//
// Fase 4, Etapa 1. O relatorio do monitor (monitor.js) ja registra, por
// fonte, os erros que aconteceram (campos `erro` espalhados por empresa do
// DOU, por fonte do IBAMA e por UF de diario estadual). Sem este modulo,
// esses erros ficam escondidos dentro do JSON: um relatorio "nada
// encontrado" pode na verdade ser "nao consegui verificar".
//
// `calcularSaude` AGREGA o que ja existe — ela NAO faz captura de erro nova.
// Recebe o objeto `relatorio` montado pelo monitor e devolve o objeto
// `saude` com um resumo legivel: status geral, contagem por fonte e a lista
// de falhas em portugues.
//
// A funcao e PURA: sem rede, sem estado, sem efeitos colaterais — o mesmo
// relatorio na entrada produz sempre a mesma saude na saida. Isso a torna
// trivial de testar (ver saude.test.js), no mesmo espirito de
// icmbio.js:categorizarOrgao.

// Calcula o resumo de saude de um relatorio do monitor.
//
// Entrada: o objeto `relatorio` no shape produzido por
// monitor.js:executarMonitorInterno — { data, executadoEm, clientes: [...] }.
// Tolera relatorio ausente/invalido e clientes sem os campos esperados.
//
// Saida: o objeto `saude` com este shape exato:
//   {
//     status: "ok" | "parcial",
//     fontes: {
//       dou:     { ok, parcial, falha },
//       ibama:   { ok, falha },
//       diarios: { ok, falha }
//     },
//     falhas: [ "<descricao legivel>", ... ]
//   }
//
// Contagens:
//   - dou.ok      = buscas de empresa sem `erro` e sem perda de pagina;
//   - dou.parcial = buscas de empresa que perderam paginas (resultado.parcial);
//   - dou.falha   = buscas de empresa com `erro`;
//   - ibama.ok/falha   = por fonte (autos, embargos, ...);
//   - diarios.ok/falha = por UF.
// Tudo somado sobre TODOS os clientes.
//
// status = "ok" so quando nao ha nenhuma falha nem parcial; senao "parcial".
function calcularSaude(relatorio) {
  const fontes = {
    dou: { ok: 0, parcial: 0, falha: 0 },
    ibama: { ok: 0, falha: 0 },
    diarios: { ok: 0, falha: 0 },
  };
  const falhas = [];

  const base = relatorio && typeof relatorio === 'object' ? relatorio : {};
  const clientes = Array.isArray(base.clientes) ? base.clientes : [];

  for (const cliente of clientes) {
    const nomeCliente = cliente && cliente.clienteNome ? cliente.clienteNome : '(cliente sem nome)';

    // Cliente inteiro que falhou: o monitor registra cliente.erro e nao
    // produz resultados/ibama/diarios para ele. Conta como uma falha de
    // diagnostico geral e segue para o proximo cliente.
    if (cliente && cliente.erro) {
      falhas.push(`Cliente ${nomeCliente}: ${cliente.erro}`);
      continue;
    }

    // DOU: uma entrada por empresa buscada.
    const resultados = cliente && Array.isArray(cliente.resultados) ? cliente.resultados : [];
    for (const res of resultados) {
      const nomeEmpresa = res && res.empresa ? res.empresa : '(empresa sem nome)';
      if (res && res.erro) {
        fontes.dou.falha += 1;
        falhas.push(`DOU - empresa ${nomeEmpresa} (cliente ${nomeCliente}): ${res.erro}`);
      } else if (res && res.parcial) {
        fontes.dou.parcial += 1;
        const detalhe = res.aviso ? res.aviso : 'perda de paginas na busca';
        falhas.push(`DOU - empresa ${nomeEmpresa} (cliente ${nomeCliente}): ${detalhe}`);
      } else {
        fontes.dou.ok += 1;
      }
    }

    // IBAMA: uma entrada por fonte (autos, embargos, ...).
    const ibama = cliente && cliente.ibama && typeof cliente.ibama === 'object' ? cliente.ibama : {};
    for (const [fonteKey, dados] of Object.entries(ibama)) {
      if (dados && dados.erro) {
        fontes.ibama.falha += 1;
        falhas.push(`IBAMA ${fonteKey} (cliente ${nomeCliente}): ${dados.erro}`);
      } else {
        fontes.ibama.ok += 1;
      }
    }

    // Diarios estaduais: uma entrada por UF.
    const diarios =
      cliente && cliente.diariosEstaduais && typeof cliente.diariosEstaduais === 'object'
        ? cliente.diariosEstaduais
        : {};
    for (const [uf, dados] of Object.entries(diarios)) {
      const rotulo = dados && dados.nome ? `${dados.nome} (${uf})` : uf;
      if (dados && dados.erro) {
        fontes.diarios.falha += 1;
        falhas.push(`Diario estadual ${rotulo} (cliente ${nomeCliente}): ${dados.erro}`);
      } else {
        fontes.diarios.ok += 1;
      }
    }
  }

  const houveProblema =
    fontes.dou.parcial > 0 ||
    fontes.dou.falha > 0 ||
    fontes.ibama.falha > 0 ||
    fontes.diarios.falha > 0 ||
    falhas.length > 0;

  return {
    status: houveProblema ? 'parcial' : 'ok',
    fontes,
    falhas,
  };
}

module.exports = { calcularSaude };
