// Painel Web — Monitor de Licenciamento Ambiental
// Consome as rotas definidas em painel.js (TASK8). Sem frameworks.

// ─── Utilitários ─────────────────────────────────────────────────────────────

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatarDataHora(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return esc(iso);
  }
}

// ─── PÁGINA: RELATÓRIOS (index.html) ─────────────────────────────────────────

let pollingVarredura = null;

async function carregarPaginaRelatorios() {
  const btnVarredura = document.getElementById('btn-varredura');
  const btnFechar = document.getElementById('btn-fechar');

  btnVarredura.addEventListener('click', dispararVarredura);
  btnFechar.addEventListener('click', fecharDetalhe);

  document.getElementById('lista-relatorios').addEventListener('click', function (e) {
    const btn = e.target.closest('[data-relatorio]');
    if (btn) abrirRelatorio(btn.dataset.relatorio);
  });

  await Promise.all([carregarRelatorios(), iniciarPollingVarredura()]);
}

async function carregarRelatorios() {
  try {
    const r = await fetch('/api/relatorios');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const dados = await r.json();
    renderizarStatus(dados.status);
    renderizarListaRelatorios(dados.relatorios);
  } catch (e) {
    document.getElementById('status').innerHTML =
      '<p class="erro">Erro ao carregar status: ' + esc(e.message) + '</p>';
  }
}

function renderizarStatus(status) {
  const el = document.getElementById('status');
  if (!status) { el.innerHTML = ''; return; }

  const erros = status.errosUltimoRelatorio;
  const badgeErro = erros > 0
    ? '<span class="badge aviso">' + esc(erros) + ' erro(s)</span>'
    : '<span class="badge ok">sem erros</span>';

  el.innerHTML =
    '<h2>Status do Sistema</h2>' +
    '<div class="status-grid">' +
      '<div class="status-item"><div class="label">Último relatório</div>' +
        '<div class="value">' + esc(status.ultimoRelatorio || '—') + '</div></div>' +
      '<div class="status-item"><div class="label">Última execução</div>' +
        '<div class="value">' + formatarDataHora(status.ultimaExecucao) + '</div></div>' +
      '<div class="status-item"><div class="label">Total de relatórios</div>' +
        '<div class="value">' + esc(status.totalRelatorios) + '</div></div>' +
      '<div class="status-item"><div class="label">Erros no último</div>' +
        '<div class="value">' + badgeErro + '</div></div>' +
    '</div>';
}

function renderizarListaRelatorios(relatorios) {
  const el = document.getElementById('lista-relatorios');
  if (!Array.isArray(relatorios) || relatorios.length === 0) {
    el.innerHTML = '<p class="vazio">Nenhum relatório encontrado.</p>';
    return;
  }

  const linhas = relatorios.map(function (r) {
    let statusHtml;
    if (r.erro) {
      statusHtml = '<span class="badge erro">ilegível</span>';
    } else if (r.erros > 0) {
      statusHtml = '<span class="badge aviso">' + esc(r.erros) + ' erro(s)</span>';
    } else {
      statusHtml = '<span class="badge ok">OK</span>';
    }
    return '<tr>' +
      '<td><button class="btn-link" data-relatorio="' + esc(r.nome) + '">' + esc(r.nome) + '</button></td>' +
      '<td>' + formatarDataHora(r.executadoEm) + '</td>' +
      '<td>' + statusHtml + '</td>' +
      '</tr>';
  }).join('');

  el.innerHTML =
    '<table>' +
      '<thead><tr><th>Arquivo</th><th>Executado em</th><th>Status</th></tr></thead>' +
      '<tbody>' + linhas + '</tbody>' +
    '</table>';
}

async function abrirRelatorio(nome) {
  const sec = document.getElementById('detalhe-relatorio');
  const titulo = document.getElementById('detalhe-titulo');
  const conteudo = document.getElementById('conteudo-relatorio');

  titulo.textContent = nome;
  conteudo.innerHTML = '<p>Carregando...</p>';
  sec.hidden = false;
  sec.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const r = await fetch('/api/relatorios/' + encodeURIComponent(nome));
    if (!r.ok) {
      const err = await r.json().catch(function () { return { erro: 'HTTP ' + r.status }; });
      throw new Error(err.erro || 'HTTP ' + r.status);
    }
    const rel = await r.json();
    conteudo.innerHTML = renderizarRelatorio(rel);
  } catch (e) {
    conteudo.innerHTML = '<p class="erro">Erro ao carregar: ' + esc(e.message) + '</p>';
  }
}

function renderizarRelatorio(rel) {
  const clientes = Array.isArray(rel.clientes) ? rel.clientes : [];
  if (clientes.length === 0) return '<p class="vazio">Relatório sem dados de clientes.</p>';

  return '<p>Executado em: ' + formatarDataHora(rel.executadoEm) + '</p>' +
    clientes.map(renderizarClienteRelatorio).join('');
}

function renderizarClienteRelatorio(c) {
  const resultados = Array.isArray(c.resultados) ? c.resultados : [];
  const empresasHtml = resultados.length > 0
    ? resultados.map(renderizarResultadoEmpresa).join('')
    : '<p class="vazio">Sem resultados de DOU.</p>';

  const ibamaHtml = renderizarIbama(c.ibama);
  const diariosHtml = renderizarDiarios(c.diariosEstaduais);

  return '<div class="cliente-item">' +
    '<h3>' + esc(c.clienteNome || c.clienteId) + '</h3>' +
    '<h4>DOU</h4>' +
    empresasHtml +
    ibamaHtml +
    diariosHtml +
    '</div>';
}

function renderizarResultadoEmpresa(res) {
  const nome = typeof res.empresa === 'string' ? res.empresa : (res.empresa && res.empresa.nome) || '?';
  const cnpj = res.cnpj || (res.empresa && res.empresa.cnpj) || '';
  const total = typeof res.totalEncontradas === 'number' ? res.totalEncontradas : 0;
  const relevantes = Array.isArray(res.relevantes) ? res.relevantes : [];
  const jaAlertadas = Array.isArray(res.jaAlertadas) ? res.jaAlertadas : [];

  let pubsHtml;
  if (res.erro) {
    pubsHtml = '<p class="erro">Erro: ' + esc(res.erro) + '</p>';
  } else if (total === 0) {
    pubsHtml = '<p class="vazio">Nenhuma publicação encontrada.</p>';
  } else {
    const todasPubs = relevantes.concat(jaAlertadas);
    pubsHtml = todasPubs.slice(0, 10).map(renderizarPublicacao).join('') +
      (todasPubs.length > 10
        ? '<p class="vazio">... e mais ' + (todasPubs.length - 10) + ' publicação(ões).</p>'
        : '');
  }

  const badge = relevantes.length > 0
    ? ' <span class="badge aviso">' + relevantes.length + ' nova(s)</span>'
    : '';

  return '<div class="empresa-item">' +
    '<h4>' + esc(nome) + badge + ' <small>' + esc(cnpj) + ' — ' + total + ' encontrada(s)</small></h4>' +
    pubsHtml +
    '</div>';
}

function renderizarPublicacao(pub) {
  const tipo = pub.tipo ? '<span class="badge aviso">' + esc(pub.tipo) + '</span> ' : '';
  const orgao = pub.orgaoStr ? '<span class="pub-orgao">' + esc(pub.orgaoStr) + '</span>' : '';
  const icmbio = pub.orgaoCategoria === 'ICMBio'
    ? ' <span class="badge ok">ICMBio</span>'
    : '';
  const link = pub.link
    ? ' <a href="' + esc(pub.link) + '" target="_blank" rel="noopener">Abrir</a>'
    : '';

  return '<div class="pub-item">' +
    '<div class="pub-titulo">' + tipo + esc(pub.titulo || '—') + icmbio + link + '</div>' +
    '<div class="pub-meta">' + orgao + (pub.data ? ' · ' + esc(pub.data) : '') + '</div>' +
    (pub.resumo ? '<div class="pub-resumo">' + esc(pub.resumo) + '</div>' : '') +
    '</div>';
}

function renderizarIbama(ibama) {
  if (!ibama || typeof ibama !== 'object') return '';
  const entradas = Object.entries(ibama);
  if (entradas.length === 0) return '';

  const itens = entradas.map(function (par) {
    const chave = par[0];
    const val = par[1];
    if (!val) return '';
    if (val.erro) return '<p class="erro">' + esc(chave) + ': ' + esc(val.erro) + '</p>';
    const novas = Array.isArray(val.novas) ? val.novas.length : 0;
    const total = typeof val.totalEncontradas === 'number' ? val.totalEncontradas : 0;
    return '<div class="fonte-fonte-item">' + esc(chave) + ': ' + total +
      ' encontrado(s)' + (novas > 0 ? ', <strong>' + novas + ' novo(s)</strong>' : '') + '</div>';
  }).join('');

  return '<div class="fonte-externa"><h4>IBAMA</h4>' + itens + '</div>';
}

function renderizarDiarios(diarios) {
  if (!diarios || typeof diarios !== 'object') return '';
  const entradas = Object.entries(diarios);
  if (entradas.length === 0) return '';

  const itens = entradas.map(function (par) {
    const uf = par[0];
    const val = par[1];
    if (!val) return '';
    if (val.erro) return '<p class="erro">' + esc(uf) + ': ' + esc(val.erro) + '</p>';
    const novas = Array.isArray(val.novas) ? val.novas.length : 0;
    const total = typeof val.totalEncontradas === 'number' ? val.totalEncontradas : 0;
    const nome = val.nome ? ' (' + esc(val.nome) + ')' : '';
    return '<div class="fonte-fonte-item">' + esc(uf) + nome + ': ' + total +
      ' encontrado(s)' + (novas > 0 ? ', <strong>' + novas + ' novo(s)</strong>' : '') + '</div>';
  }).join('');

  return '<div class="fonte-externa"><h4>Diários Estaduais</h4>' + itens + '</div>';
}

function fecharDetalhe() {
  document.getElementById('detalhe-relatorio').hidden = true;
}

// ─── Varredura manual ─────────────────────────────────────────────────────────

async function dispararVarredura() {
  const btn = document.getElementById('btn-varredura');
  btn.disabled = true;

  try {
    const r = await fetch('/api/varredura', { method: 'POST' });
    const dados = await r.json();
    if (!r.ok) throw new Error(dados.erro || 'HTTP ' + r.status);
    atualizarStatusVarredura(dados.estado);
    pollingVarredura = setInterval(consultarStatusVarredura, 2000);
  } catch (e) {
    document.getElementById('status-varredura').innerHTML =
      '<span class="erro">Erro: ' + esc(e.message) + '</span>';
    btn.disabled = false;
  }
}

async function consultarStatusVarredura() {
  try {
    const r = await fetch('/api/varredura/status');
    const estado = await r.json();
    atualizarStatusVarredura(estado);

    if (estado.status !== 'em execucao') {
      clearInterval(pollingVarredura);
      pollingVarredura = null;
      document.getElementById('btn-varredura').disabled = false;
      if (estado.status === 'concluido') {
        await carregarRelatorios();
      }
    }
  } catch (e) {
    clearInterval(pollingVarredura);
    pollingVarredura = null;
    document.getElementById('btn-varredura').disabled = false;
  }
}

function atualizarStatusVarredura(estado) {
  if (!estado) return;
  const el = document.getElementById('status-varredura');
  const classes = { ocioso: '', 'em execucao': 'aviso', concluido: 'ok', erro: 'erro' };
  const cls = classes[estado.status] || '';
  const badge = cls ? '<span class="badge ' + cls + '">' + esc(estado.status) + '</span>' : '';
  const detalhe = estado.erro
    ? ' — <span class="erro">' + esc(estado.erro) + '</span>'
    : (estado.concluidoEm ? ' — ' + formatarDataHora(estado.concluidoEm) : '');
  el.innerHTML = badge + detalhe;
}

async function iniciarPollingVarredura() {
  try {
    const r = await fetch('/api/varredura/status');
    const estado = await r.json();
    atualizarStatusVarredura(estado);
    if (estado.status === 'em execucao') {
      document.getElementById('btn-varredura').disabled = true;
      pollingVarredura = setInterval(consultarStatusVarredura, 2000);
    }
  } catch (e) { /* ignora — não bloqueia o carregamento da página */ }
}

// ─── PÁGINA: EMPRESAS (empresas.html) ────────────────────────────────────────

let dadosClientes = [];

async function carregarPaginaEmpresas() {
  document.getElementById('form-add').addEventListener('submit', adicionarEmpresa);
  document.getElementById('clientes').addEventListener('click', function (e) {
    const btn = e.target.closest('[data-remover-cnpj]');
    if (btn) removerEmpresa(btn.dataset.removerClienteid, btn.dataset.removerCnpj);
  });
  await carregarEmpresas();
}

async function carregarEmpresas() {
  try {
    const r = await fetch('/api/empresas');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const dados = await r.json();
    dadosClientes = Array.isArray(dados.clientes) ? dados.clientes : [];
    renderizarClientes();
    popularSelectClientes();
  } catch (e) {
    document.getElementById('clientes').innerHTML =
      '<p class="erro">Erro ao carregar: ' + esc(e.message) + '</p>';
  }
}

function renderizarClientes() {
  const el = document.getElementById('clientes');
  if (dadosClientes.length === 0) {
    el.innerHTML = '<p class="vazio">Nenhum cliente configurado.</p>';
    return;
  }

  el.innerHTML = dadosClientes.map(function (c) {
    const empresas = Array.isArray(c.empresas) ? c.empresas : [];
    const inativo = c.ativo === false
      ? ' <span class="badge aviso">inativo</span>'
      : '';

    const linhas = empresas.map(function (e) {
      return '<tr>' +
        '<td>' + esc(e.nome) + '</td>' +
        '<td>' + esc(e.cnpj) + '</td>' +
        '<td>' + esc(e.uf || '—') + '</td>' +
        '<td>' + (e.ativa === false
          ? '<span class="badge aviso">inativa</span>'
          : '<span class="badge ok">ativa</span>') + '</td>' +
        '<td><button class="btn-remover" data-remover-clienteid="' + esc(c.id) +
          '" data-remover-cnpj="' + esc(e.cnpj) + '">Remover</button></td>' +
        '</tr>';
    }).join('');

    return '<div class="card" style="margin-bottom:12px;">' +
      '<h3>' + esc(c.nome) + ' <small style="font-weight:normal;color:#888;">(' + esc(c.id) + ')</small>' + inativo + '</h3>' +
      (empresas.length > 0
        ? '<table><thead><tr><th>Nome</th><th>CNPJ</th><th>UF</th><th>Status</th><th></th></tr></thead>' +
          '<tbody>' + linhas + '</tbody></table>'
        : '<p class="vazio">Nenhuma empresa cadastrada.</p>') +
      '</div>';
  }).join('');
}

function popularSelectClientes() {
  const sel = document.getElementById('add-clienteid');
  if (!sel) return;
  sel.innerHTML = dadosClientes.map(function (c) {
    return '<option value="' + esc(c.id) + '">' + esc(c.nome) + '</option>';
  }).join('');
}

async function adicionarEmpresa(ev) {
  ev.preventDefault();
  const msg = document.getElementById('msg-add');
  const clienteId = document.getElementById('add-clienteid').value;
  const nome = document.getElementById('add-nome').value.trim();
  const cnpj = document.getElementById('add-cnpj').value.trim();
  const uf = document.getElementById('add-uf').value.trim();

  msg.innerHTML = '';

  const corpo = { acao: 'adicionar', clienteId: clienteId, empresa: { nome: nome, cnpj: cnpj } };
  if (uf) corpo.empresa.uf = uf;

  try {
    const r = await fetch('/api/empresas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const dados = await r.json();
    if (!r.ok) throw new Error(dados.erro || 'HTTP ' + r.status);
    msg.innerHTML = '<p class="ok">Empresa adicionada com sucesso.</p>';
    ev.target.reset();
    await carregarEmpresas();
  } catch (e) {
    msg.innerHTML = '<p class="erro">Erro: ' + esc(e.message) + '</p>';
  }
}

async function removerEmpresa(clienteId, cnpj) {
  if (!confirm('Remover empresa ' + cnpj + ' do cliente "' + clienteId + '"?')) return;

  try {
    const r = await fetch('/api/empresas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'remover', clienteId: clienteId, cnpj: cnpj }),
    });
    const dados = await r.json();
    if (!r.ok) throw new Error(dados.erro || 'HTTP ' + r.status);
    await carregarEmpresas();
  } catch (e) {
    alert('Erro ao remover: ' + e.message);
  }
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

if (document.getElementById('lista-relatorios')) {
  carregarPaginaRelatorios();
}

if (document.getElementById('clientes')) {
  carregarPaginaEmpresas();
}
