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
