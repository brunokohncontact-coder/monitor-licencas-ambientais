// Modulo de alertas por e-mail — usa Resend para enviar notificacoes.
// E chamado uma vez por cliente: recebe os dados daquele cliente
// ({ data, executadoEm, clienteNome, resultados, ibama }) e seus
// destinatarios. So envia se houver ao menos uma publicacao nova.

const { Resend } = require('resend');

// Conta alertas novos somando DOU + IBAMA + diarios estaduais
function contarAlertas(relatorio) {
  const dou = relatorio.resultados.reduce((acc, r) => acc + r.relevantes.length, 0);
  const ibama = Object.values(relatorio.ibama || {}).reduce(
    (acc, f) => acc + (f.novas?.length || 0),
    0
  );
  const diarios = Object.values(relatorio.diariosEstaduais || {}).reduce(
    (acc, d) => acc + (d.novas?.length || 0),
    0
  );
  return { dou, ibama, diarios, total: dou + ibama + diarios };
}

// Cores por gravidade (CSS inline obrigatorio para compat. com clientes de e-mail).
// Valores fixos definidos pela spec da Fase 5.
function cssBadge(gravidade) {
  if (gravidade === 'critica') {
    return 'display:inline-block; background:#fee2e2; color:#991b1b; border-left:4px solid #dc2626; padding:2px 8px; font-size:11px; font-weight:700; border-radius:3px;';
  }
  if (gravidade === 'alta') {
    return 'display:inline-block; background:#ffedd5; color:#9a3412; border-left:4px solid #ea580c; padding:2px 8px; font-size:11px; font-weight:700; border-radius:3px;';
  }
  if (gravidade === 'media') {
    return 'display:inline-block; background:#fef9c3; color:#854d0e; padding:2px 8px; font-size:11px; font-weight:700; border-radius:3px;';
  }
  // baixa (ou sem classificacao se chamado por engano)
  return 'display:inline-block; background:#dcfce7; color:#166534; padding:2px 8px; font-size:11px; font-weight:700; border-radius:3px;';
}

function rotuloGravidade(gravidade) {
  if (gravidade === 'critica') return 'CRITICA';
  if (gravidade === 'alta') return 'ALTA';
  if (gravidade === 'media') return 'MEDIA';
  if (gravidade === 'baixa') return 'BAIXA';
  return '';
}

// Coleta itens urgentes (criticas/altas) do cliente para a secao Atencao Imediata.
// DOU/DOESP: gravidade vem de pub.classificacao (TASK0). IBAMA: gravidade INFERIDA
// pela chave (autos = alta; embargos = critica) — nao chamar classificarPublicacao.
function coletarUrgentes(cliente) {
  const urgentes = [];
  for (const res of (cliente.resultados || [])) {
    for (const pub of (res.relevantes || [])) {
      const grav = pub.classificacao && pub.classificacao.gravidade;
      if (grav === 'critica' || grav === 'alta') {
        urgentes.push({
          empresa: res.empresa || '',
          titulo: pub.titulo || '(sem titulo)',
          link: pub.link || '',
          gravidade: grav,
          prazo: (pub.classificacao && pub.classificacao.prazo) || '',
          acao: (pub.classificacao && pub.classificacao.acao) || '',
          fonte: 'DOU',
        });
      }
    }
  }
  for (const [uf, dados] of Object.entries(cliente.diariosEstaduais || {})) {
    for (const pub of (dados.novas || [])) {
      const grav = pub.classificacao && pub.classificacao.gravidade;
      if (grav === 'critica' || grav === 'alta') {
        urgentes.push({
          empresa: pub.empresaConfig || '',
          titulo: pub.titulo || '(sem titulo)',
          link: pub.link || '',
          gravidade: grav,
          prazo: (pub.classificacao && pub.classificacao.prazo) || '',
          acao: (pub.classificacao && pub.classificacao.acao) || '',
          fonte: `Diario ${uf}`,
        });
      }
    }
  }
  // IBAMA autos: inferido alta
  const autos = cliente.ibama && cliente.ibama.autos;
  for (const pub of ((autos && autos.novas) || [])) {
    urgentes.push({
      empresa: pub.empresaConfig || pub.nome || '',
      titulo: pub.titulo || 'Auto de Infracao',
      link: '',
      gravidade: 'alta',
      prazo: '20 dias corridos para apresentar defesa administrativa',
      acao: 'Apresentar defesa administrativa',
      fonte: 'IBAMA - Auto de Infracao',
    });
  }
  // IBAMA embargos: inferido critica
  const embargos = cliente.ibama && cliente.ibama.embargos;
  for (const pub of ((embargos && embargos.novas) || [])) {
    urgentes.push({
      empresa: pub.empresaConfig || pub.nome || '',
      titulo: pub.titulo || 'Embargo',
      link: '',
      gravidade: 'critica',
      prazo: 'Imediato - verifique urgentemente',
      acao: 'Contatar advogado ambiental imediatamente',
      fonte: 'IBAMA - Embargo',
    });
  }
  return urgentes;
}

// Linha de urgente na secao destacada.
function montarLinhaUrgente(item) {
  const link = item.link
    ? `<div style="margin-top:6px;"><a href="${item.link}" style="font-size:12px; color:#2980b9;">Abrir &rarr;</a></div>`
    : '';
  const prazo = item.prazo
    ? `<div style="font-style:italic; font-size:12px; color:#555; margin-bottom:4px;">${item.prazo}</div>`
    : '';
  const acao = item.acao
    ? `<div style="font-weight:700; font-size:13px; color:#9a3412;">${item.acao}</div>`
    : '';
  return `
        <div style="margin:10px 0; padding:10px 12px; background:#ffffff; border-radius:4px;">
          <div style="font-size:12px; color:#666; margin-bottom:4px;">${item.empresa}${item.fonte ? ` &mdash; ${item.fonte}` : ''}</div>
          <div style="margin-bottom:6px;">
            <span style="${cssBadge(item.gravidade)}">${rotuloGravidade(item.gravidade)}</span>
            <span style="font-weight:600; margin-left:8px;">${item.titulo}</span>
          </div>
          ${prazo}
          ${acao}
          ${link}
        </div>`;
}

// Linha de publicacao normal (media/baixa, ou sem classificacao para retrocompat).
function montarLinhaPublicacao(pub) {
  const grav = pub.classificacao && pub.classificacao.gravidade;
  const badge = grav
    ? `<span style="${cssBadge(grav)}">${rotuloGravidade(grav)}</span> `
    : '';
  const prazo = pub.classificacao && pub.classificacao.prazo
    ? `<div style="font-style:italic; font-size:12px; color:#555; margin-bottom:4px;">${pub.classificacao.prazo}</div>`
    : '';
  const acao = pub.classificacao && pub.classificacao.acao
    ? `<div style="font-weight:700; font-size:13px; color:#854d0e;">${pub.classificacao.acao}</div>`
    : '';
  const link = pub.link
    ? `<div style="margin-top:6px;"><a href="${pub.link}" style="font-size:12px; color:#2980b9;">Abrir &rarr;</a></div>`
    : '';
  return `
          <div style="margin:8px 0; padding:10px 12px; background:#f8f9fa; border-radius:4px;">
            <div style="margin-bottom:4px;">${badge}<span style="font-weight:600;">${pub.titulo || '(sem titulo)'}</span></div>
            ${prazo}
            ${acao}
            ${link}
          </div>`;
}

// Monta o HTML de um cliente: cabecalho, secao Atencao Imediata (se houver
// urgentes), secoes por empresa (medias/baixas), diarios estaduais e rodape.
function gerarHtmlCliente(cliente, dataExec, executadoEm) {
  const urgentes = coletarUrgentes(cliente);
  const empresasVerificadas = (cliente.resultados || []).length;
  const totalDOU = (cliente.resultados || []).reduce(
    (acc, r) => acc + ((r.relevantes || []).length),
    0
  );
  const totalIbama = Object.values(cliente.ibama || {}).reduce(
    (acc, f) => acc + ((f.novas || []).length),
    0
  );
  const totalDiarios = Object.values(cliente.diariosEstaduais || {}).reduce(
    (acc, d) => acc + ((d.novas || []).length),
    0
  );
  const totalNovas = totalDOU + totalIbama + totalDiarios;

  const secaoAtencao = urgentes.length > 0
    ? `
        <div style="background:#fff7ed; padding:16px; border-left:4px solid #ea580c; border-radius:6px; margin-bottom:20px;">
          <h2 style="margin:0 0 12px 0; color:#9a3412; font-size:16px;">&#9888;&#65039; Atencao Imediata &mdash; acao necessaria</h2>
          ${urgentes.map(montarLinhaUrgente).join('')}
        </div>`
    : '';

  const blocosEmpresas = (cliente.resultados || [])
    .map((res) => {
      const pubsNormais = (res.relevantes || []).filter((pub) => {
        const grav = pub.classificacao && pub.classificacao.gravidade;
        return grav !== 'critica' && grav !== 'alta';
      });
      const totalRelevantes = (res.relevantes || []).length;
      if (totalRelevantes === 0) {
        return `
        <div style="margin-bottom:20px;">
          <h3 style="margin:0 0 4px; color:#2c3e50; font-size:14px;">${res.empresa || ''}</h3>
          <div style="font-size:12px; color:#888; margin-bottom:6px;">CNPJ: ${res.cnpj || ''} &mdash; sem urgentes</div>
        </div>`;
      }
      if (pubsNormais.length === 0) {
        // Tudo desta empresa ja apareceu em Atencao Imediata; ainda assim
        // mostra o cabecalho da empresa para o leitor saber o que foi visto.
        return `
        <div style="margin-bottom:20px;">
          <h3 style="margin:0 0 4px; color:#2c3e50; font-size:14px;">${res.empresa || ''}</h3>
          <div style="font-size:12px; color:#888; margin-bottom:6px;">CNPJ: ${res.cnpj || ''} &mdash; ${totalRelevantes} publicacao(oes) em Atencao Imediata</div>
        </div>`;
      }
      const pubs = pubsNormais.map(montarLinhaPublicacao).join('');
      return `
        <div style="margin-bottom:20px;">
          <h3 style="margin:0 0 4px; color:#2c3e50; font-size:14px;">${res.empresa || ''}</h3>
          <div style="font-size:12px; color:#888; margin-bottom:6px;">CNPJ: ${res.cnpj || ''} &mdash; ${pubsNormais.length} publicacao(oes)</div>
          ${pubs}
        </div>`;
    })
    .join('');

  const blocosDiarios = Object.entries(cliente.diariosEstaduais || {})
    .map(([uf, dados]) => {
      const normais = (dados.novas || []).filter((pub) => {
        const grav = pub.classificacao && pub.classificacao.gravidade;
        return grav !== 'critica' && grav !== 'alta';
      });
      if (normais.length === 0) return '';
      const pubs = normais.map(montarLinhaPublicacao).join('');
      return `
        <div style="margin-bottom:20px;">
          <h3 style="margin:0 0 4px; color:#16a085; font-size:14px;">${dados.nome || 'Diario estadual'} (${uf})</h3>
          ${pubs}
        </div>`;
    })
    .join('');

  const rodapeContagem = urgentes.length > 0
    ? `${totalNovas} publicacoes novas &middot; ${empresasVerificadas} empresas verificadas &middot; proxima varredura: amanha as 8h (dias uteis). Sendo ${urgentes.length} de atencao imediata.`
    : `${totalNovas} publicacoes novas &middot; ${empresasVerificadas} empresas verificadas &middot; proxima varredura: amanha as 8h (dias uteis).`;

  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif; max-width:700px; margin:0 auto; padding:20px; color:#333;">
  <div style="background:#2c3e50; color:white; padding:18px 20px; border-radius:8px 8px 0 0;">
    <h2 style="margin:0; font-size:18px;">Monitor de Licencas Ambientais</h2>
    <div style="font-size:14px; opacity:0.85; margin-top:4px;">${cliente.clienteNome ? `${cliente.clienteNome} &mdash; ` : ''}${dataExec || ''}</div>
  </div>
  <div style="background:white; border:1px solid #ddd; border-top:none; padding:20px; border-radius:0 0 8px 8px;">
    ${secaoAtencao}
    ${blocosEmpresas}
    ${blocosDiarios}
    <div style="font-size:11px; color:#666; margin-top:24px; padding-top:16px; border-top:1px solid #eee;">
      ${rodapeContagem}
    </div>
    <div style="font-size:11px; color:#aaa; margin-top:8px;">
      Gerado em ${executadoEm || ''}
    </div>
  </div>
</body>
</html>`;
}

// Gera o corpo HTML do e-mail. Aceita o bloco per-cliente usado por
// enviarAlerta ({ data, executadoEm, clienteNome, resultados, ibama, ... })
// e tambem o relatorio multi-cliente ({ clientes:[...] }) — para que
// integracoes externas e testes da Fase 5 possam passar qualquer um dos dois.
function gerarHtml(relatorio) {
  const r = relatorio || {};
  const clientes = Array.isArray(r.clientes) && r.clientes.length > 0
    ? r.clientes
    : [{
        clienteId: r.clienteId || null,
        clienteNome: r.clienteNome || null,
        resultados: r.resultados || [],
        ibama: r.ibama || {},
        diariosEstaduais: r.diariosEstaduais || {},
      }];

  return clientes
    .map((cliente) => gerarHtmlCliente(cliente, r.data, r.executadoEm))
    .join('\n');
}

// Envia o e-mail de alerta para todos os destinatarios configurados.
// Retorna true se enviado, false se nao havia alertas ou e-mail nao configurado.
async function enviarAlerta(relatorio, opcoes = {}) {
  const t = contarAlertas(relatorio);

  if (t.total === 0) {
    console.log('Nenhum alerta novo — e-mail nao enviado.');
    return false;
  }

  const { apiKey, de, para } = opcoes;

  if (!apiKey || !de || !para || para.length === 0) {
    console.log('Alerta por e-mail nao configurado (falta apiKey, de ou para). Pulando envio.');
    return false;
  }

  const resend = new Resend(apiKey);

  const partes = [];
  if (t.dou > 0) partes.push(`${t.dou} DOU`);
  if (t.ibama > 0) partes.push(`${t.ibama} IBAMA`);
  if (t.diarios > 0) partes.push(`${t.diarios} diarios estaduais`);
  const prefixoCliente = relatorio.clienteNome ? `${relatorio.clienteNome} — ` : '';
  const assunto = `[Monitor Ambiental] ${prefixoCliente}${t.total} alerta(s) — ${partes.join(', ')} — ${relatorio.data}`;
  const html = gerarHtml(relatorio);

  try {
    const { data, error } = await resend.emails.send({
      from: de,
      to: para,
      subject: assunto,
      html,
    });

    if (error) {
      console.error('Erro ao enviar e-mail:', error.message);
      return false;
    }

    console.log(`E-mail enviado com sucesso! ID: ${data.id}`);
    console.log(`  Para: ${para.join(', ')}`);
    return true;
  } catch (err) {
    console.error('Excecao ao enviar e-mail:', err.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Aviso de falha ao operador (Fase 4, Etapa 1)
// ---------------------------------------------------------------------------
// Diferente do enviarAlerta acima: aquele vai aos CLIENTES e so sai quando ha
// publicacoes novas. Este vai ao OPERADOR (dono do sistema) e sai quando a
// propria execucao teve problemas — uma fonte falhou, perdeu paginas, ou o
// monitor nem rodou. E o mecanismo de "o monitor sabe e avisa quando ele
// mesmo falha".

// Gera o corpo HTML do e-mail de aviso de falha ao operador.
// Recebe o objeto `saude` (ver saude.js) e a `data` da execucao.
function gerarHtmlFalha(saude, data) {
  const s = saude && typeof saude === 'object' ? saude : { status: 'parcial', fontes: {}, falhas: [] };
  const falhas = Array.isArray(s.falhas) ? s.falhas : [];
  const f = s.fontes || {};
  const dou = f.dou || { ok: 0, parcial: 0, falha: 0 };
  const ibama = f.ibama || { ok: 0, falha: 0 };
  const diarios = f.diarios || { ok: 0, falha: 0 };

  const itensFalha = falhas.length
    ? falhas
        .map(
          (txt) => `
          <li style="margin:6px 0; font-size:13px; color:#333;">${txt}</li>`
        )
        .join('')
    : '<li style="margin:6px 0; font-size:13px; color:#888;">Sem detalhes de falha.</li>';

  return `
    <!DOCTYPE html>
    <html>
    <body style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:20px;color:#333;">
      <div style="background:#c0392b;color:white;padding:20px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;">&#9888; Monitor de Licencas Ambientais</h2>
        <div style="font-size:14px;opacity:0.9;margin-top:4px;">Aviso de falha &mdash; ${data || ''}</div>
      </div>

      <div style="background:white;border:1px solid #ddd;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
        <div style="background:#fdf2f2;border:1px solid #c0392b;padding:12px;border-radius:6px;margin-bottom:20px;">
          <strong style="color:#c0392b;">A execucao terminou com problemas.</strong>
          Algumas fontes podem nao ter sido verificadas — confira abaixo.
        </div>

        <h3 style="margin:0 0 8px;color:#2c3e50;">Resumo por fonte</h3>
        <ul style="font-size:13px;color:#555;line-height:1.6;">
          <li>DOU &mdash; ok: ${dou.ok}, parcial: ${dou.parcial}, falha: ${dou.falha}</li>
          <li>IBAMA &mdash; ok: ${ibama.ok}, falha: ${ibama.falha}</li>
          <li>Diarios estaduais &mdash; ok: ${diarios.ok}, falha: ${diarios.falha}</li>
        </ul>

        <h3 style="margin:16px 0 8px;color:#2c3e50;">Falhas detectadas</h3>
        <ul style="padding-left:18px;margin:0;">${itensFalha}</ul>

        <div style="font-size:11px;color:#aaa;margin-top:24px;padding-top:16px;border-top:1px solid #eee;">
          Aviso automatico do Monitor de Licencas Ambientais
        </div>
      </div>
    </body>
    </html>`;
}

// Envia ao operador um e-mail de aviso quando a execucao teve problemas.
//
// saude: objeto produzido por saude.js:calcularSaude.
// opcoes: { apiKey, de, para, data }
//   - para: array de e-mails do operador (config.alerta.operador);
//   - data: a data da execucao (so para o assunto/corpo).
//
// So envia quando saude.status !== "ok". Quando nao ha apiKey/de/para,
// PULA o envio com um aviso no console — mesmo padrao do enviarAlerta normal,
// para que um operador nao configurado nunca derrube a execucao.
// Retorna true se enviou, false se pulou ou falhou.
async function enviarAlertaDeFalha(saude, opcoes = {}) {
  const s = saude && typeof saude === 'object' ? saude : {};

  if (s.status === 'ok') {
    // Execucao saudavel — nada a avisar.
    return false;
  }

  const { apiKey, de, para, data } = opcoes;

  if (!apiKey || !de || !para || para.length === 0) {
    console.log(
      'Aviso ao operador nao configurado (falta apiKey, de ou alerta.operador). Pulando envio.'
    );
    return false;
  }

  const resend = new Resend(apiKey);
  const assunto = `⚠ [Monitor Ambiental] Execucao com problemas - ${data || ''}`;
  const html = gerarHtmlFalha(s, data);

  try {
    const { data: resposta, error } = await resend.emails.send({
      from: de,
      to: para,
      subject: assunto,
      html,
    });

    if (error) {
      console.error('Erro ao enviar aviso de falha ao operador:', error.message);
      return false;
    }

    console.log(`Aviso de falha enviado ao operador. ID: ${resposta.id}`);
    console.log(`  Para: ${para.join(', ')}`);
    return true;
  } catch (err) {
    console.error('Excecao ao enviar aviso de falha ao operador:', err.message);
    return false;
  }
}

// Envia ao operador um e-mail quando o monitor NEM RODOU (falha fatal antes
// de produzir o relatorio — ex.: navegador nao abre, config invalida).
//
// opcoes: { apiKey, de, para, data }. erro: o objeto Error capturado.
//
// E *best-effort*: se a propria falha for falta de internet, o e-mail nao sai
// e tudo bem — o problema ja esta no log. Nunca lanca excecao; no maximo
// retorna false. Quando o operador nao esta configurado, PULA com aviso.
async function enviarAlertaDeFalhaFatal(erro, opcoes = {}) {
  const { apiKey, de, para, data } = opcoes;
  const mensagemErro = erro && erro.message ? erro.message : String(erro);

  if (!apiKey || !de || !para || para.length === 0) {
    console.log(
      'Aviso de falha fatal nao configurado (falta apiKey, de ou alerta.operador). Pulando envio.'
    );
    return false;
  }

  const resend = new Resend(apiKey);
  const assunto = `⚠ [Monitor Ambiental] O monitor nao rodou - ${data || ''}`;
  const html = `
    <!DOCTYPE html>
    <html>
    <body style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:20px;color:#333;">
      <div style="background:#c0392b;color:white;padding:20px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;">&#9888; Monitor de Licencas Ambientais</h2>
        <div style="font-size:14px;opacity:0.9;margin-top:4px;">O monitor nao rodou &mdash; ${data || ''}</div>
      </div>
      <div style="background:white;border:1px solid #ddd;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
        <div style="background:#fdf2f2;border:1px solid #c0392b;padding:12px;border-radius:6px;margin-bottom:20px;">
          <strong style="color:#c0392b;">A execucao falhou antes de produzir o relatorio.</strong>
          Nenhuma fonte foi verificada nesta data.
        </div>
        <h3 style="margin:0 0 8px;color:#2c3e50;">Erro</h3>
        <pre style="font-size:13px;color:#333;background:#f8f9fa;padding:12px;border-radius:4px;white-space:pre-wrap;">${mensagemErro}</pre>
        <div style="font-size:11px;color:#aaa;margin-top:24px;padding-top:16px;border-top:1px solid #eee;">
          Aviso automatico do Monitor de Licencas Ambientais
        </div>
      </div>
    </body>
    </html>`;

  try {
    const { data: resposta, error } = await resend.emails.send({
      from: de,
      to: para,
      subject: assunto,
      html,
    });

    if (error) {
      console.error('Erro ao enviar aviso de falha fatal ao operador:', error.message);
      return false;
    }

    console.log(`Aviso de falha fatal enviado ao operador. ID: ${resposta.id}`);
    return true;
  } catch (err) {
    console.error('Excecao ao enviar aviso de falha fatal ao operador:', err.message);
    return false;
  }
}

module.exports = {
  enviarAlerta,
  gerarHtml,
  contarAlertas,
  enviarAlertaDeFalha,
  enviarAlertaDeFalhaFatal,
  gerarHtmlFalha,
};
