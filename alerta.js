// Modulo de alertas por e-mail — usa Resend para enviar notificacoes.
// So envia e-mail se houver ao menos uma publicacao relevante no relatorio.

const { Resend } = require('resend');

// Conta alertas novos somando DOU + IBAMA
function contarAlertas(relatorio) {
  const dou = relatorio.resultados.reduce((acc, r) => acc + r.relevantes.length, 0);
  const ibama = Object.values(relatorio.ibama || {}).reduce(
    (acc, f) => acc + (f.novas?.length || 0),
    0
  );
  return { dou, ibama, total: dou + ibama };
}

// Gera o corpo HTML do e-mail de alerta
function gerarHtml(relatorio) {
  const t = contarAlertas(relatorio);

  const linhasEmpresas = relatorio.resultados
    .filter((r) => r.relevantes.length > 0)
    .map((res) => {
      const pubs = res.relevantes
        .map(
          (pub, i) => `
          <div style="margin:12px 0; padding:12px; background:#f8f9fa; border-left:3px solid #e74c3c; border-radius:4px;">
            <div style="font-size:12px; color:#666; margin-bottom:4px;">${pub.tipo} &mdash; ${pub.data}</div>
            <div style="font-weight:600; margin-bottom:4px;">${pub.titulo || '(sem titulo)'}</div>
            <div style="font-size:12px; color:#555; margin-bottom:6px;">${pub.orgaoStr}</div>
            <div style="font-size:13px; color:#333; margin-bottom:8px;">${pub.resumo.slice(0, 300)}${pub.resumo.length > 300 ? '...' : ''}</div>
            <a href="${pub.link}" style="font-size:12px; color:#2980b9;">Ver no DOU &rarr;</a>
          </div>`
        )
        .join('');

      return `
        <div style="margin-bottom:24px;">
          <h3 style="margin:0 0 4px; color:#2c3e50;">${res.empresa}</h3>
          <div style="font-size:12px; color:#888; margin-bottom:8px;">CNPJ: ${res.cnpj} &mdash; ${res.relevantes.length} publicacao(oes) relevante(s)</div>
          ${pubs}
        </div>`;
    })
    .join('<hr style="border:none;border-top:1px solid #eee;margin:16px 0;">');

  // Secao IBAMA — uma subsecao por fonte (autos, embargos, etc).
  // So aparece se houver algo novo.
  const blocosIBAMA = Object.entries(relatorio.ibama || {})
    .filter(([, dados]) => (dados.novas || []).length > 0)
    .map(([fonteKey, dados]) => {
      const itens = dados.novas
        .map(
          (pub) => `
          <div style="margin:12px 0; padding:12px; background:#fdf2f2; border-left:3px solid #c0392b; border-radius:4px;">
            <div style="font-size:12px; color:#666; margin-bottom:4px;">${pub.titulo} &mdash; ${pub.data}</div>
            <div style="font-weight:600; margin-bottom:4px;">${pub.empresaConfig || pub.nome}</div>
            <div style="font-size:12px; color:#555; margin-bottom:6px;">CNPJ: ${pub.cnpj} &mdash; ${pub.municipio}/${pub.uf} &mdash; Processo ${pub.processo}</div>
            <div style="font-size:13px; color:#c0392b; font-weight:600; margin-bottom:6px;">Valor: R$ ${pub.valor}</div>
            <div style="font-size:13px; color:#333;">${(pub.resumo || '').slice(0, 400)}${(pub.resumo || '').length > 400 ? '...' : ''}</div>
          </div>`
        )
        .join('');
      return `
        <div style="margin-bottom:24px;">
          <h3 style="margin:16px 0 8px; color:#c0392b;">IBAMA &mdash; ${fonteKey}</h3>
          ${itens}
        </div>`;
    })
    .join('');

  const secaoDOU = t.dou > 0
    ? `<h2 style="margin:8px 0 16px; color:#2c3e50; font-size:18px;">DOU</h2>${linhasEmpresas}`
    : '';

  const secaoIBAMA = t.ibama > 0
    ? `<h2 style="margin:24px 0 16px; color:#2c3e50; font-size:18px; border-top:1px solid #eee; padding-top:16px;">IBAMA &mdash; Dados Abertos</h2>${blocosIBAMA}`
    : '';

  return `
    <!DOCTYPE html>
    <html>
    <body style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:20px;color:#333;">
      <div style="background:#2c3e50;color:white;padding:20px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;">Monitor de Licencas Ambientais</h2>
        <div style="font-size:14px;opacity:0.8;margin-top:4px;">${relatorio.data}</div>
      </div>

      <div style="background:white;border:1px solid #ddd;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
        <div style="background:#fef9e7;border:1px solid #f39c12;padding:12px;border-radius:6px;margin-bottom:24px;">
          <strong style="color:#e67e22;">&#9888; ${t.total} alerta(s) novo(s)</strong>
          &mdash; ${t.dou} do DOU, ${t.ibama} do IBAMA
        </div>

        ${secaoDOU}
        ${secaoIBAMA}

        <div style="font-size:11px;color:#aaa;margin-top:24px;padding-top:16px;border-top:1px solid #eee;">
          Gerado em ${relatorio.executadoEm} &mdash; Monitor de Licencas Ambientais
        </div>
      </div>
    </body>
    </html>`;
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
  const assunto = `[Monitor Ambiental] ${t.total} alerta(s) — ${partes.join(', ')} — ${relatorio.data}`;
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

// Envia e-mail de falha quando o monitor lanca excecao durante execucao automatica.
// Usa as mesmas configuracoes de alerta (apiKey, de, para).
// Projetado para ser chamado no catch do cron — nunca deve lancar excecao.
async function enviarAlertaFalha(erro, opcoes = {}) {
  const { apiKey, de, para } = opcoes;

  if (!apiKey || !de || !para || para.length === 0) {
    console.log('Alerta de falha: e-mail nao configurado. Pulando envio.');
    return false;
  }

  const resend = new Resend(apiKey);
  const agora = new Date().toISOString();
  const mensagem = erro?.message || String(erro);
  // Escapa HTML basico para evitar que a stack quebre o layout do e-mail
  const stackRaw = erro?.stack || '(sem stack trace)';
  const stack = stackRaw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const html = `
    <!DOCTYPE html>
    <html>
    <body style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:20px;color:#333;">
      <div style="background:#c0392b;color:white;padding:20px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;">Monitor de Licencas Ambientais &mdash; FALHA</h2>
        <div style="font-size:14px;opacity:0.8;margin-top:4px;">${agora}</div>
      </div>

      <div style="background:white;border:1px solid #ddd;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
        <div style="background:#fef2f2;border:1px solid #c0392b;padding:12px;border-radius:6px;margin-bottom:24px;">
          <strong style="color:#c0392b;">&#9888; O monitor encerrou com erro durante a execucao automatica.</strong>
          Verifique o log da execucao para mais detalhes.
        </div>

        <h3 style="color:#333;margin-top:0;">Erro</h3>
        <div style="background:#f8f9fa;padding:12px;border-radius:4px;font-family:monospace;font-size:13px;color:#c0392b;word-break:break-all;">
          ${mensagem}
        </div>

        <h3 style="color:#333;margin-top:16px;">Stack trace</h3>
        <pre style="background:#f8f9fa;padding:12px;border-radius:4px;font-size:12px;color:#555;overflow:auto;white-space:pre-wrap;margin:0;">${stack}</pre>

        <div style="font-size:11px;color:#aaa;margin-top:24px;padding-top:16px;border-top:1px solid #eee;">
          Gerado em ${agora} &mdash; Monitor de Licencas Ambientais
        </div>
      </div>
    </body>
    </html>`;

  try {
    const { data, error } = await resend.emails.send({
      from: de,
      to: para,
      subject: `[Monitor Ambiental] FALHA na execucao — ${agora}`,
      html,
    });

    if (error) {
      console.error('Erro ao enviar alerta de falha:', error.message);
      return false;
    }

    console.log(`Alerta de falha enviado! ID: ${data.id}`);
    return true;
  } catch (err) {
    console.error('Excecao ao enviar alerta de falha:', err.message);
    return false;
  }
}

module.exports = { enviarAlerta, enviarAlertaFalha };
