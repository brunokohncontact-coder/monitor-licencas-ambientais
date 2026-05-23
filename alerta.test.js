// Testes do modulo de alertas (alerta.js).
// gerarHtml e contarAlertas sao exercitados por uma fixture de relatorio
// multi-cliente. O cliente do Resend e substituido por um duble em memoria —
// nenhum e-mail real e enviado e nenhuma chamada de rede acontece.

const test = require('node:test');
const assert = require('node:assert');

// --- Duble do Resend (sem rede) -------------------------------------------
// Registra os envios em memoria para que os testes verifiquem destinatarios
// e o isolamento entre clientes.
const enviados = [];

class FakeResend {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.emails = {
      send: async ({ from, to, subject, html }) => {
        enviados.push({ from, to, subject, html });
        return { data: { id: `fake-${enviados.length}` }, error: null };
      },
    };
  }
}

// Injeta o duble no cache de modulos ANTES de carregar alerta.js, que faz
// require('resend') no topo do arquivo.
const resendPath = require.resolve('resend');
require.cache[resendPath] = {
  id: resendPath,
  filename: resendPath,
  loaded: true,
  exports: { Resend: FakeResend },
};

const { enviarAlerta, gerarHtml, contarAlertas } = require('./alerta');

// --- Fixture: relatorio multi-cliente -------------------------------------
// Dois clientes com empresas e publicacoes distintas, mais um cliente sem
// nada novo — cobre o shape produzido pelo laco de clientes do monitor.js.
const relatorioMultiCliente = {
  data: '15-05-2026',
  executadoEm: '2026-05-15T11:00:00.000Z',
  clientes: [
    {
      clienteId: 'cliente-a',
      clienteNome: 'Cliente A',
      resultados: [
        {
          empresa: 'Empresa Alfa',
          cnpj: '11.111.111/0001-11',
          totalEncontradas: 3,
          relevantes: [
            {
              tipo: 'Licenca',
              data: '15/05/2026',
              titulo: 'Renovacao de licenca de operacao',
              orgaoStr: 'Ministerio do Meio Ambiente',
              resumo: 'Concede renovacao de licenca ambiental para a Empresa Alfa.',
              link: 'https://www.in.gov.br/exemplo-alfa',
              classPK: 'PK-A1',
            },
          ],
          jaAlertadas: [],
          todas: [],
        },
      ],
      ibama: {
        autos: {
          novas: [
            {
              titulo: 'Auto de Infracao 123',
              data: '14/05/2026',
              nome: 'EMPRESA ALFA LTDA',
              empresaConfig: 'Empresa Alfa',
              cnpj: '11.111.111/0001-11',
              municipio: 'Sao Paulo',
              uf: 'SP',
              processo: '02001.000123/2026-01',
              valor: '50.000,00',
              resumo: 'Operacao sem licenca ambiental valida.',
              classPK: 'SEQ-A1',
            },
          ],
          jaAlertadas: [],
          totalEncontradas: 1,
        },
      },
    },
    {
      clienteId: 'cliente-b',
      clienteNome: 'Cliente B',
      resultados: [
        {
          empresa: 'Empresa Beta',
          cnpj: '22.222.222/0001-22',
          totalEncontradas: 0,
          relevantes: [],
          jaAlertadas: [],
          todas: [],
        },
      ],
      ibama: {},
    },
  ],
};

// Monta o bloco que o monitor.js entrega a alerta.js para um unico cliente.
function blocoDoCliente(c) {
  return {
    data: relatorioMultiCliente.data,
    executadoEm: relatorioMultiCliente.executadoEm,
    clienteNome: c.clienteNome,
    resultados: c.resultados,
    ibama: c.ibama,
  };
}

// --- contarAlertas --------------------------------------------------------

test('contarAlertas soma as publicacoes novas de DOU e IBAMA', () => {
  const t = contarAlertas(blocoDoCliente(relatorioMultiCliente.clientes[0]));
  assert.strictEqual(t.dou, 1);
  assert.strictEqual(t.ibama, 1);
  assert.strictEqual(t.total, 2);
});

test('contarAlertas retorna zero para cliente sem publicacoes novas', () => {
  const t = contarAlertas(blocoDoCliente(relatorioMultiCliente.clientes[1]));
  assert.strictEqual(t.total, 0);
});

// --- gerarHtml ------------------------------------------------------------

test('gerarHtml produz HTML com o nome do cliente e suas publicacoes', () => {
  const html = gerarHtml(blocoDoCliente(relatorioMultiCliente.clientes[0]));
  assert.match(html, /Cliente A/);
  assert.match(html, /Renovacao de licenca de operacao/);
  assert.match(html, /Empresa Alfa/);
  assert.match(html, /Auto de Infracao 123/);
});

test('gerarHtml nao vaza dados de um cliente no HTML de outro', () => {
  const htmlA = gerarHtml(blocoDoCliente(relatorioMultiCliente.clientes[0]));
  const htmlB = gerarHtml(blocoDoCliente(relatorioMultiCliente.clientes[1]));
  assert.match(htmlA, /Cliente A/);
  assert.ok(!htmlA.includes('Cliente B'), 'HTML do Cliente A nao deve citar o Cliente B');
  assert.ok(
    !htmlB.includes('Empresa Alfa'),
    'HTML do Cliente B nao deve citar empresas do Cliente A'
  );
});

// --- enviarAlerta (um e-mail por cliente, isolamento de destinatarios) ----

test('enviarAlerta envia um e-mail por cliente para os destinatarios daquele cliente', async () => {
  enviados.length = 0;
  const base = { apiKey: 'fake-key', de: 'remetente@exemplo.com' };

  const okA = await enviarAlerta(blocoDoCliente(relatorioMultiCliente.clientes[0]), {
    ...base,
    para: ['cliente-a@exemplo.com'],
  });
  const okB = await enviarAlerta(blocoDoCliente(relatorioMultiCliente.clientes[1]), {
    ...base,
    para: ['cliente-b@exemplo.com'],
  });

  assert.strictEqual(okA, true, 'Cliente A tem publicacoes novas — e-mail enviado');
  assert.strictEqual(okB, false, 'Cliente B sem publicacoes novas — e-mail nao enviado');
  assert.strictEqual(enviados.length, 1, 'apenas um e-mail foi enviado');
  assert.deepStrictEqual(
    enviados[0].to,
    ['cliente-a@exemplo.com'],
    'e-mail vai apenas para os destinatarios do Cliente A'
  );
});

test('enviarAlerta nao envia quando faltam destinatarios (alerta nao configurado)', async () => {
  enviados.length = 0;
  const ok = await enviarAlerta(blocoDoCliente(relatorioMultiCliente.clientes[0]), {
    apiKey: 'fake-key',
    de: 'remetente@exemplo.com',
    para: [],
  });
  assert.strictEqual(ok, false);
  assert.strictEqual(enviados.length, 0);
});

// --- gerarHtml: novo template Fase 5 -------------------------------------

test('gerarHtml inclui a secao Atencao Imediata quando ha publicacao critica/alta', () => {
  const bloco = {
    data: '15-05-2026',
    executadoEm: '2026-05-15T11:00:00.000Z',
    clienteNome: 'Cliente Urgente',
    resultados: [
      {
        empresa: 'Empresa Gamma',
        cnpj: '33.333.333/0001-33',
        totalEncontradas: 1,
        relevantes: [
          {
            tipo: 'Auto de Infracao',
            titulo: 'Autuacao por desmatamento',
            resumo: 'Auto de infracao ambiental.',
            link: 'https://www.in.gov.br/exemplo-gamma',
            classificacao: {
              gravidade: 'alta',
              prazo: '20 dias corridos para apresentar defesa administrativa',
              acao: 'Apresentar defesa administrativa',
              explicacao: 'Auto de infracao emitido pelo orgao ambiental.',
            },
          },
        ],
        jaAlertadas: [],
        todas: [],
      },
    ],
    ibama: {},
  };
  const html = gerarHtml(bloco);
  assert.match(html, /Atencao Imediata/);
  assert.match(html, /Autuacao por desmatamento/);
  assert.match(html, /20 dias corridos/);
  assert.match(html, /Apresentar defesa administrativa/);
});

test('gerarHtml inclui Atencao Imediata e marca gravidade critica para IBAMA embargos.novas', () => {
  const bloco = {
    data: '15-05-2026',
    executadoEm: '2026-05-15T11:00:00.000Z',
    clienteNome: 'Cliente Embargo',
    resultados: [],
    ibama: {
      embargos: {
        novas: [
          {
            titulo: 'Embargo de operacao - area X',
            nome: 'EMPRESA EMBARGADA LTDA',
            empresaConfig: 'Empresa Embargada',
            cnpj: '44.444.444/0001-44',
            municipio: 'Belem',
            uf: 'PA',
            processo: '02001.000999/2026-99',
            valor: '0,00',
            resumo: 'Embargo administrativo de area irregular.',
          },
        ],
        jaAlertadas: [],
        totalEncontradas: 1,
      },
    },
  };
  const html = gerarHtml(bloco);
  assert.match(html, /Atencao Imediata/);
  assert.match(html, /Embargo de operacao - area X/);
  // Critica usa o background #fee2e2 (cor exata da spec)
  assert.match(html, /#fee2e2/);
  assert.match(html, /CRITICA/);
});

test('gerarHtml NAO inclui Atencao Imediata quando nao ha urgentes', () => {
  const bloco = {
    data: '15-05-2026',
    executadoEm: '2026-05-15T11:00:00.000Z',
    clienteNome: 'Cliente Tranquilo',
    resultados: [
      {
        empresa: 'Empresa Calma',
        cnpj: '55.555.555/0001-55',
        totalEncontradas: 1,
        relevantes: [
          {
            tipo: 'Aviso',
            titulo: 'Aviso institucional',
            resumo: 'Comunicado geral.',
            link: 'https://www.in.gov.br/calma',
            classificacao: {
              gravidade: 'baixa',
              prazo: 'Sem prazo definido',
              acao: 'Apenas registrar',
              explicacao: 'Publicacao informativa sem impacto operacional.',
            },
          },
        ],
        jaAlertadas: [],
        todas: [],
      },
    ],
    ibama: {},
  };
  const html = gerarHtml(bloco);
  assert.ok(!html.includes('Atencao Imediata'),
    'sem urgentes, a secao Atencao Imediata deve ser omitida');
  assert.match(html, /Empresa Calma/);
  assert.match(html, /BAIXA/);
});

test('gerarHtml mostra IBAMA autos com gravidade ALTA (inferida pela chave)', () => {
  const bloco = {
    data: '15-05-2026',
    executadoEm: '2026-05-15T11:00:00.000Z',
    clienteNome: 'Cliente Auto',
    resultados: [],
    ibama: {
      autos: {
        novas: [
          {
            titulo: 'Auto de Infracao IBAMA 9999',
            nome: 'AUTUADA SA',
            empresaConfig: 'Autuada',
            cnpj: '66.666.666/0001-66',
            municipio: 'Manaus',
            uf: 'AM',
            processo: '02001.000777/2026-77',
            valor: '100.000,00',
            resumo: 'Auto de infracao por crime ambiental.',
          },
        ],
        jaAlertadas: [],
        totalEncontradas: 1,
      },
    },
  };
  const html = gerarHtml(bloco);
  assert.match(html, /Auto de Infracao IBAMA 9999/);
  assert.match(html, /ALTA/);
  // Cor exata para alta
  assert.match(html, /#ffedd5/);
});

test('gerarHtml e retrocompativel com publicacao sem classificacao', () => {
  const bloco = {
    data: '15-05-2026',
    executadoEm: '2026-05-15T11:00:00.000Z',
    clienteNome: 'Cliente Legado',
    resultados: [
      {
        empresa: 'Empresa Antiga',
        cnpj: '77.777.777/0001-77',
        totalEncontradas: 1,
        relevantes: [
          {
            tipo: 'Aviso',
            titulo: 'Publicacao legada sem classificacao',
            resumo: 'Item de relatorio antigo.',
            link: 'https://www.in.gov.br/legado',
            // sem classificacao
          },
        ],
        jaAlertadas: [],
        todas: [],
      },
    ],
    ibama: {},
  };
  let html;
  assert.doesNotThrow(() => {
    html = gerarHtml(bloco);
  }, 'gerarHtml nao deve lancar para publicacao sem classificacao');
  assert.match(html, /Publicacao legada sem classificacao/);
  assert.match(html, /Empresa Antiga/);
});

test('gerarHtml inclui rodape com contagem e proxima varredura', () => {
  const bloco = {
    data: '15-05-2026',
    executadoEm: '2026-05-15T11:00:00.000Z',
    clienteNome: 'Cliente Rodape',
    resultados: [
      {
        empresa: 'Empresa Rodape',
        cnpj: '88.888.888/0001-88',
        totalEncontradas: 1,
        relevantes: [
          {
            tipo: 'Aviso',
            titulo: 'Item de rodape',
            resumo: 'Conteudo.',
            link: 'https://www.in.gov.br/rodape',
            classificacao: {
              gravidade: 'media',
              prazo: 'Sem prazo formal',
              acao: 'Avaliar impacto',
              explicacao: 'Item informativo.',
            },
          },
        ],
        jaAlertadas: [],
        todas: [],
      },
    ],
    ibama: {},
  };
  const html = gerarHtml(bloco);
  assert.match(html, /publicacoes novas/);
  assert.match(html, /empresas verificadas/);
  assert.match(html, /proxima varredura/);
});

test('gerarHtml aceita relatorio multi-cliente (shape {clientes:[]})', () => {
  const html = gerarHtml({
    data: '15-05-2026',
    executadoEm: '2026-05-15T11:00:00.000Z',
    clientes: [
      {
        clienteId: 'cliente-a',
        clienteNome: 'Cliente A',
        resultados: [
          {
            empresa: 'Empresa Alfa',
            cnpj: '11.111.111/0001-11',
            totalEncontradas: 0,
            relevantes: [],
            jaAlertadas: [],
            todas: [],
          },
        ],
        ibama: { autos: { novas: [], jaAlertadas: [], totalEncontradas: 0 } },
        diariosEstaduais: {},
      },
    ],
  });
  assert.strictEqual(typeof html, 'string');
  assert.match(html, /Cliente A/);
  assert.match(html, /Empresa Alfa/);
});
