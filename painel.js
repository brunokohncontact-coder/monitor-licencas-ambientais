// Painel Web do Monitor de Licencas Ambientais — Etapa 4 (Q4=B).
//
// Servidor Express de operador unico (admin): uma senha simples protege o
// painel inteiro. O admin ve e gerencia TODOS os clientes — nao ha login por
// cliente nem multi-tenant. Funcoes do painel:
//  - visualizar o historico de relatorios (relatorio-*.json) e o status do sistema;
//  - gerenciar (adicionar/remover) as empresas monitoradas de cada cliente;
//  - disparar uma varredura manual (executarMonitor) de forma assincrona.
//
// A senha mora em config.local.json (painel.senha), nunca em config.json nem
// no git. O modulo apenas DEFINE funcoes ao ser carregado; o servidor so sobe
// quando chamado diretamente (node painel.js) ou via iniciar().

const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { executarMonitor } = require('./monitor');
const { rodarAutoteste } = require('./autoteste');
const { carregarConfig } = require('./config-loader');

const RAIZ = __dirname;
const CONFIG_PATH = path.join(RAIZ, 'config.json');
const PUBLIC_DIR = path.join(RAIZ, 'public');

// Secoes globais do config.json que NUNCA podem ser perdidas ao gravar a
// edicao de empresas. Lista usada so como documentacao/guarda — a gravacao
// regrava o objeto inteiro, entao preserva qualquer secao automaticamente.
const SECOES_GLOBAIS = ['filtro', 'agendamento', 'alerta', 'ibama', 'diariosEstaduais', 'painel'];

// UFs validas do Brasil — usadas para validar o campo opcional uf da empresa.
const UFS_VALIDAS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
];

// Estado da varredura manual. Compartilhado pelo processo do painel: a rota
// POST /api/varredura dispara executarMonitor de forma assincrona e atualiza
// este objeto; GET /api/varredura/status apenas le.
let estadoVarredura = {
  status: 'ocioso',
  iniciadoEm: null,
  concluidoEm: null,
  erro: null,
};

// Estado do autoteste de fontes. Mesma logica da varredura: a rota
// POST /api/autoteste dispara rodarAutoteste de forma assincrona.
let estadoAutoteste = {
  status: 'ocioso',
  iniciadoEm: null,
  concluidoEm: null,
  resultado: null,
  erro: null,
};

// ---------------------------------------------------------------------------
// Funcoes puras (testaveis isoladamente)
// ---------------------------------------------------------------------------

// Normaliza um relatorio para a visao multi-cliente.
// - Relatorio novo (Fase 3, ja tem clientes[]): devolvido como esta.
// - Relatorio legado (Fase 2, shape plano { data, executadoEm, resultados,
//   ibama }, sem clientes[]): envolvido num unico cliente "default", igual ao
//   que o config-loader faz com o config.json legado.
// Nunca lanca excecao — um relatorio legado ou corrompido nao pode derrubar
// a tela de relatorios.
function normalizarRelatorio(rel) {
  const base = rel && typeof rel === 'object' ? rel : {};

  if (Array.isArray(base.clientes)) {
    return base;
  }

  return {
    data: base.data || null,
    executadoEm: base.executadoEm || null,
    clientes: [
      {
        clienteId: 'default',
        clienteNome: 'Cliente Padrao',
        resultados: Array.isArray(base.resultados) ? base.resultados : [],
        ibama: base.ibama && typeof base.ibama === 'object' ? base.ibama : {},
        diariosEstaduais:
          base.diariosEstaduais && typeof base.diariosEstaduais === 'object'
            ? base.diariosEstaduais
            : {},
      },
    ],
  };
}

// Valida um CNPJ: aceita com ou sem mascara, confere 14 digitos e os dois
// digitos verificadores pelo algoritmo oficial. Rejeita sequencias de um
// digito so (ex.: 00.000.000/0000-00).
function validarCNPJ(valor) {
  if (typeof valor !== 'string') return false;
  const d = valor.replace(/\D/g, '');
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;

  const calcularDigito = (pesos) => {
    let soma = 0;
    for (let i = 0; i < pesos.length; i++) {
      soma += Number(d[i]) * pesos[i];
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const digito1 = calcularDigito([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (digito1 !== Number(d[12])) return false;

  const digito2 = calcularDigito([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (digito2 !== Number(d[13])) return false;

  return true;
}

// Valida o nome de uma empresa: texto nao vazio com tamanho razoavel.
function validarNome(valor) {
  if (typeof valor !== 'string') return false;
  const limpo = valor.trim();
  return limpo.length >= 2 && limpo.length <= 200;
}

// Valida a UF opcional de uma empresa. Vazio/ausente e aceito (campo opcional).
function validarUF(valor) {
  if (valor === undefined || valor === null || valor === '') return true;
  if (typeof valor !== 'string') return false;
  return UFS_VALIDAS.includes(valor.trim().toUpperCase());
}

// Conta os erros registrados num relatorio (por cliente, por empresa e por
// fonte). Usado no status do sistema. Normaliza antes para tratar legado.
function contarErrosRelatorio(rel) {
  const norm = normalizarRelatorio(rel);
  let total = 0;
  for (const cliente of norm.clientes || []) {
    if (cliente.erro) total += 1;
    for (const res of cliente.resultados || []) {
      if (res.erro) total += 1;
    }
    for (const fonte of Object.values(cliente.ibama || {})) {
      if (fonte && fonte.erro) total += 1;
    }
    for (const diario of Object.values(cliente.diariosEstaduais || {})) {
      if (diario && diario.erro) total += 1;
    }
  }
  return total;
}

// Extrai o resumo de saude de um relatorio para exibicao no painel.
// Relatorio da Fase 4 traz o campo `saude` pronto (ver saude.js); um
// relatorio LEGADO (Fase 2/3) nao tem esse campo — neste caso devolve null,
// e o painel cai graciosamente no comportamento antigo (errosUltimoRelatorio).
// Nunca lanca excecao: um relatorio antigo nunca pode derrubar a tela.
function saudeDoRelatorio(rel) {
  if (!rel || typeof rel !== 'object') return null;
  const s = rel.saude;
  if (!s || typeof s !== 'object') return null;
  return s;
}

// ---------------------------------------------------------------------------
// Acesso a arquivos
// ---------------------------------------------------------------------------

// Le o config.json BRUTO (sem mesclar config.local.json). Usado para gravar a
// edicao de empresas — gravar o resultado de carregarConfig() vazaria a chave
// Resend e a senha do painel para dentro do config.json versionado.
function lerConfigJson() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

// Grava o config.json. Recebe o objeto inteiro (lido por lerConfigJson e com
// apenas as empresas alteradas), portanto preserva todas as secoes globais.
function gravarConfigJson(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
}

// Lista os relatorios relatorio-*.json da raiz, do mais recente para o mais
// antigo (o nome usa data ISO, ordenavel lexicograficamente). Cada item traz
// metadados leves; um arquivo ilegivel vira um item com erro, sem quebrar a lista.
function listarRelatorios() {
  let arquivos;
  try {
    arquivos = fs.readdirSync(RAIZ);
  } catch {
    return [];
  }

  return arquivos
    .filter((nome) => /^relatorio-.*\.json$/.test(nome))
    .sort()
    .reverse()
    .map((nome) => {
      const meta = { nome, data: null, executadoEm: null, erro: null, saude: null };
      try {
        const conteudo = JSON.parse(fs.readFileSync(path.join(RAIZ, nome), 'utf-8'));
        meta.data = conteudo.data || null;
        meta.executadoEm = conteudo.executadoEm || null;
        meta.erros = contarErrosRelatorio(conteudo);
        // saude so existe nos relatorios da Fase 4; nos antigos fica null.
        meta.saude = saudeDoRelatorio(conteudo);
      } catch (err) {
        meta.erro = 'Arquivo ilegivel: ' + err.message;
      }
      return meta;
    });
}

// Monta o status do sistema: ultimo run, total de relatorios, erros do ultimo
// relatorio, a saude da ultima execucao e o estado da varredura manual.
// saudeUltimoRelatorio e null para relatorios legados sem o campo `saude` —
// o frontend trata esse caso caindo no comportamento antigo.
function statusSistema() {
  const relatorios = listarRelatorios();
  const ultimo = relatorios[0] || null;
  return {
    totalRelatorios: relatorios.length,
    ultimoRelatorio: ultimo ? ultimo.nome : null,
    ultimaExecucao: ultimo ? ultimo.executadoEm : null,
    errosUltimoRelatorio: ultimo && typeof ultimo.erros === 'number' ? ultimo.erros : 0,
    saudeUltimoRelatorio: ultimo ? ultimo.saude || null : null,
    varredura: estadoVarredura,
  };
}

// ---------------------------------------------------------------------------
// Sessao / autenticacao
// ---------------------------------------------------------------------------

// Middleware de guarda: bloqueia rotas protegidas quando nao ha sessao valida.
// Sem sessao -> redireciona para /login. Aplicado a toda rota de
// visualizacao, gerenciamento e varredura.
function exigirSessao(req, res, next) {
  if (req.session && req.session.autenticado) {
    return next();
  }
  return res.redirect('/login');
}

// ---------------------------------------------------------------------------
// Paginas HTML embutidas
// ---------------------------------------------------------------------------
// O frontend completo (pasta public/) e entregue pela TASK9. Enquanto ele nao
// existe, estas paginas minimas mantem o painel utilizavel e auto-contido.

function paginaLogin(mensagemErro) {
  const erro = mensagemErro
    ? `<p style="color:#c0392b;margin:8px 0;">${mensagemErro}</p>`
    : '';
  return `<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Painel - Login</title>
</head>
<body style="font-family:Arial,sans-serif;background:#ecf0f1;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <form method="post" action="/login" style="background:#fff;padding:32px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);width:300px;">
    <h2 style="margin:0 0 16px;color:#2c3e50;">Monitor de Licencas</h2>
    <p style="font-size:13px;color:#888;margin:0 0 16px;">Acesso do operador</p>
    ${erro}
    <input type="password" name="senha" placeholder="Senha" required autofocus
      style="width:100%;padding:10px;box-sizing:border-box;border:1px solid #ccc;border-radius:4px;margin-bottom:12px;">
    <button type="submit"
      style="width:100%;padding:10px;background:#2c3e50;color:#fff;border:none;border-radius:4px;cursor:pointer;">Entrar</button>
  </form>
</body>
</html>`;
}

function paginaDashboard() {
  return `<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Painel - Monitor de Licencas Ambientais</title>
</head>
<body style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;padding:24px;color:#333;">
  <div style="display:flex;justify-content:space-between;align-items:center;">
    <h2 style="color:#2c3e50;">Monitor de Licencas Ambientais</h2>
    <form method="post" action="/logout"><button type="submit"
      style="padding:8px 14px;background:#c0392b;color:#fff;border:none;border-radius:4px;cursor:pointer;">Sair</button></form>
  </div>
  <p style="color:#888;">Painel no ar. O frontend completo e entregue separadamente.</p>
  <h3 style="color:#2c3e50;">Rotas da API</h3>
  <ul style="font-size:14px;color:#555;line-height:1.7;">
    <li>GET /api/relatorios — historico de relatorios e status do sistema</li>
    <li>GET /api/relatorios/:nome — um relatorio normalizado</li>
    <li>GET /api/empresas — empresas monitoradas por cliente</li>
    <li>POST /api/empresas — adicionar/remover empresa de um cliente</li>
    <li>POST /api/varredura — disparar varredura manual</li>
    <li>GET /api/varredura/status — estado da varredura</li>
  </ul>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Construcao do app Express
// ---------------------------------------------------------------------------

// Cria e configura o app Express. Recebe a senha e opcoes por parametro.
// A senha nunca precisa ser lida no momento do require, e o app fica
// testavel sem subir o servidor. sessionSecret deve ser fornecido para
// garantir persistencia entre restarts.
function criarApp(opcoes = {}) {
  const senha = opcoes.senha;
  const sessionSecret = opcoes.sessionSecret;
  const app = express();

  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use(
    session({
      secret: sessionSecret || crypto.randomBytes(32).toString('hex'),
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 8 },
    })
  );

  // Arquivos estaticos da pasta public/ (frontend da TASK9). index:false para
  // que GET / continue passando pela guarda de sessao em vez de servir
  // public/index.html direto. Dados sensiveis so saem pelas rotas /api
  // protegidas; os assets estaticos (css/js) nao sao sensiveis.
  app.use(express.static(PUBLIC_DIR, { index: false }));

  // --- Rotas publicas (login) ---

  app.get('/login', (req, res) => {
    if (req.session && req.session.autenticado) {
      return res.redirect('/');
    }
    const arquivoLogin = path.join(PUBLIC_DIR, 'login.html');
    if (fs.existsSync(arquivoLogin)) {
      return res.sendFile(arquivoLogin);
    }
    res.set('Content-Type', 'text/html; charset=utf-8').send(paginaLogin(null));
  });

  app.post('/login', (req, res) => {
    const informada = req.body && typeof req.body.senha === 'string' ? req.body.senha : '';
    // Comparacao server-side: a senha configurada nunca sai do servidor.
    if (senha && informada === senha) {
      req.session.autenticado = true;
      return res.redirect('/');
    }
    res
      .status(401)
      .set('Content-Type', 'text/html; charset=utf-8')
      .send(paginaLogin('Senha incorreta.'));
  });

  app.post('/logout', (req, res) => {
    if (req.session) {
      return req.session.destroy(() => res.redirect('/login'));
    }
    res.redirect('/login');
  });

  // --- Rotas protegidas (exigem sessao) ---

  app.get('/', exigirSessao, (req, res) => {
    const arquivoIndex = path.join(PUBLIC_DIR, 'index.html');
    if (fs.existsSync(arquivoIndex)) {
      return res.sendFile(arquivoIndex);
    }
    res.set('Content-Type', 'text/html; charset=utf-8').send(paginaDashboard());
  });

  // Lista o historico de relatorios + status do sistema.
  app.get('/api/relatorios', exigirSessao, (req, res) => {
    res.json({ relatorios: listarRelatorios(), status: statusSistema() });
  });

  // Devolve um relatorio especifico ja normalizado para a visao multi-cliente.
  // O nome e validado (apenas digitos e hifens) para impedir path traversal.
  app.get('/api/relatorios/:nome', exigirSessao, (req, res) => {
    const nome = req.params.nome;
    if (!/^relatorio-[0-9-]+\.json$/.test(nome)) {
      return res.status(400).json({ erro: 'Nome de relatorio invalido.' });
    }
    const caminho = path.join(RAIZ, path.basename(nome));
    if (!fs.existsSync(caminho)) {
      return res.status(404).json({ erro: 'Relatorio nao encontrado.' });
    }
    try {
      const conteudo = JSON.parse(fs.readFileSync(caminho, 'utf-8'));
      // Normaliza para que um relatorio legado nunca derrube a tela.
      return res.json(normalizarRelatorio(conteudo));
    } catch (err) {
      return res.status(500).json({ erro: 'Falha ao ler o relatorio: ' + err.message });
    }
  });

  // Lista as empresas monitoradas, por cliente. Le o config.json bruto e
  // devolve so a secao clientes (nunca expoe segredos de config.local.json).
  app.get('/api/empresas', exigirSessao, (req, res) => {
    try {
      const config = lerConfigJson();
      const clientes = Array.isArray(config.clientes) ? config.clientes : [];
      const visao = clientes.map((c) => ({
        id: c.id,
        nome: c.nome,
        ativo: c.ativo,
        empresas: Array.isArray(c.empresas) ? c.empresas : [],
      }));
      return res.json({ clientes: visao });
    } catch (err) {
      return res.status(500).json({ erro: 'Falha ao ler a configuracao: ' + err.message });
    }
  });

  // Adiciona ou remove uma empresa de um cliente. Body:
  //  - adicionar: { acao:'adicionar', clienteId, empresa:{ nome, cnpj, uf? } }
  //  - remover:   { acao:'remover',   clienteId, cnpj }
  // Grava o config.json regravando o objeto inteiro (preserva secoes globais)
  // e jamais toca em config.local.json.
  app.post('/api/empresas', exigirSessao, (req, res) => {
    const corpo = req.body || {};
    const acao = corpo.acao;

    if (acao !== 'adicionar' && acao !== 'remover') {
      return res.status(400).json({ erro: 'Acao invalida (use adicionar ou remover).' });
    }
    if (typeof corpo.clienteId !== 'string' || corpo.clienteId.trim() === '') {
      return res.status(400).json({ erro: 'clienteId obrigatorio.' });
    }

    let config;
    try {
      config = lerConfigJson();
    } catch (err) {
      return res.status(500).json({ erro: 'Falha ao ler a configuracao: ' + err.message });
    }

    if (!Array.isArray(config.clientes)) {
      return res.status(400).json({ erro: 'config.json sem a secao clientes[].' });
    }

    const cliente = config.clientes.find((c) => c.id === corpo.clienteId);
    if (!cliente) {
      return res.status(404).json({ erro: 'Cliente nao encontrado: ' + corpo.clienteId });
    }
    if (!Array.isArray(cliente.empresas)) {
      cliente.empresas = [];
    }

    if (acao === 'adicionar') {
      const empresa = corpo.empresa || {};
      if (!validarNome(empresa.nome)) {
        return res.status(400).json({ erro: 'Nome da empresa invalido.' });
      }
      if (!validarCNPJ(empresa.cnpj)) {
        return res.status(400).json({ erro: 'CNPJ invalido.' });
      }
      if (!validarUF(empresa.uf)) {
        return res.status(400).json({ erro: 'UF invalida.' });
      }
      const alvo = empresa.cnpj.replace(/\D/g, '');
      const existe = cliente.empresas.some((e) => String(e.cnpj).replace(/\D/g, '') === alvo);
      if (existe) {
        return res.status(409).json({ erro: 'Empresa com este CNPJ ja monitorada.' });
      }
      const nova = {
        nome: empresa.nome.trim(),
        cnpj: empresa.cnpj.trim(),
        ativa: true,
      };
      if (empresa.uf) {
        nova.uf = empresa.uf.trim().toUpperCase();
      }
      cliente.empresas.push(nova);
    } else {
      // remover
      if (!validarCNPJ(corpo.cnpj)) {
        return res.status(400).json({ erro: 'CNPJ invalido.' });
      }
      const alvo = corpo.cnpj.replace(/\D/g, '');
      const antes = cliente.empresas.length;
      cliente.empresas = cliente.empresas.filter(
        (e) => String(e.cnpj).replace(/\D/g, '') !== alvo
      );
      if (cliente.empresas.length === antes) {
        return res.status(404).json({ erro: 'Empresa nao encontrada para este cliente.' });
      }
    }

    try {
      gravarConfigJson(config);
    } catch (err) {
      return res.status(500).json({ erro: 'Falha ao gravar a configuracao: ' + err.message });
    }

    res.json({ ok: true, clienteId: cliente.id, empresas: cliente.empresas });
  });

  // Dispara a varredura manual. executarMonitor usa Playwright e demora, entao
  // roda de forma assincrona: a rota atualiza o estado e retorna imediatamente.
  app.post('/api/varredura', exigirSessao, (req, res) => {
    if (estadoVarredura.status === 'em execucao') {
      return res.status(409).json({ erro: 'Varredura ja em execucao.', estado: estadoVarredura });
    }

    estadoVarredura = {
      status: 'em execucao',
      iniciadoEm: new Date().toISOString(),
      concluidoEm: null,
      erro: null,
    };

    // Sem await: a rota nao bloqueia o event loop esperando a varredura.
    executarMonitor()
      .then(() => {
        estadoVarredura = {
          status: 'concluido',
          iniciadoEm: estadoVarredura.iniciadoEm,
          concluidoEm: new Date().toISOString(),
          erro: null,
        };
      })
      .catch((err) => {
        estadoVarredura = {
          status: 'erro',
          iniciadoEm: estadoVarredura.iniciadoEm,
          concluidoEm: new Date().toISOString(),
          erro: err && err.message ? err.message : String(err),
        };
      });

    res.status(202).json({ ok: true, estado: estadoVarredura });
  });

  // Estado atual da varredura: ocioso / em execucao / concluido / erro.
  app.get('/api/varredura/status', exigirSessao, (req, res) => {
    res.json(estadoVarredura);
  });

  // Dispara o autoteste de fontes. Igual a varredura: assincrono, nao bloqueia
  // o event loop. A rota retorna 202 imediatamente; o resultado fica em
  // GET /api/autoteste/status quando o teste terminar.
  app.post('/api/autoteste', exigirSessao, (req, res) => {
    if (estadoAutoteste.status === 'em execucao') {
      return res.status(409).json({ erro: 'Autoteste ja em execucao.', estado: estadoAutoteste });
    }

    estadoAutoteste = {
      status: 'em execucao',
      iniciadoEm: new Date().toISOString(),
      concluidoEm: null,
      resultado: null,
      erro: null,
    };

    const config = carregarConfig();
    rodarAutoteste(config)
      .then((resultado) => {
        estadoAutoteste = {
          status: 'concluido',
          iniciadoEm: estadoAutoteste.iniciadoEm,
          concluidoEm: new Date().toISOString(),
          resultado,
          erro: null,
        };
      })
      .catch((err) => {
        estadoAutoteste = {
          status: 'erro',
          iniciadoEm: estadoAutoteste.iniciadoEm,
          concluidoEm: new Date().toISOString(),
          resultado: null,
          erro: err && err.message ? err.message : String(err),
        };
      });

    res.status(202).json({ ok: true, estado: estadoAutoteste });
  });

  // Estado atual do autoteste: ocioso / em execucao / concluido / erro.
  app.get('/api/autoteste/status', exigirSessao, (req, res) => {
    res.json(estadoAutoteste);
  });

  return app;
}

// ---------------------------------------------------------------------------
// Subida do servidor
// ---------------------------------------------------------------------------

// Sobe o painel. Le porta, senha e sessionSecret da config; se painel.senha
// nao estiver definida em config.local.json, falha de forma clara em
// portugues — o painel nao sobe sem senha (nunca assume senha vazia).
// sessionSecret e lido de config.local.json; se nao existir, gera um novo
// e persiste em config.local.json para que permaneca consistente entre restarts.
function iniciar(opcoes = {}) {
  const config = opcoes.config || carregarConfig();
  const painel = config.painel || {};
  const senha = painel.senha;

  if (typeof senha !== 'string' || senha.trim() === '') {
    throw new Error(
      'Senha do painel nao configurada. Defina "painel.senha" em config.local.json ' +
        '(veja config.local.example.json). O painel nao sobe sem senha.'
    );
  }

  let sessionSecret = painel.sessionSecret;
  if (!sessionSecret || typeof sessionSecret !== 'string') {
    sessionSecret = crypto.randomBytes(32).toString('hex');
    const localPath = path.join(RAIZ, 'config.local.json');
    let local = {};
    if (fs.existsSync(localPath)) {
      try {
        local = JSON.parse(fs.readFileSync(localPath, 'utf-8'));
      } catch {
        // arquivo invalido — comeca do vazio
      }
    }
    local.painel = local.painel || {};
    local.painel.sessionSecret = sessionSecret;
    fs.writeFileSync(localPath, JSON.stringify(local, null, 2) + '\n');
    console.log('Session secret gerado e salvo em config.local.json');
  }

  const porta = painel.porta || 3000;
  const app = criarApp({ senha, sessionSecret });

  return app.listen(porta, () => {
    console.log(`Painel no ar em http://localhost:${porta}`);
  });
}

// Se chamado diretamente (node painel.js), sobe o servidor.
if (require.main === module) {
  try {
    iniciar();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = {
  normalizarRelatorio,
  validarCNPJ,
  validarNome,
  validarUF,
  contarErrosRelatorio,
  saudeDoRelatorio,
  exigirSessao,
  listarRelatorios,
  statusSistema,
  criarApp,
  iniciar,
};
