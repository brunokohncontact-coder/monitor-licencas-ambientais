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

// Gera o corpo HTML do e-mail de alerta
function gerarHtml(relatorio) {
  const t = contarAlertas(relatorio);

  const linhasEmpresas = relatorio.resultados
    .filter((r) => r.relevantes.length > 0)
    .map((res) => {
      const pubs = res.relevantes
        .map((pub) => {
          // Publicacoes do ICMBio (orgaoCategoria) recebem um selo destacado.
          const seloICMBio =
            pub.orgaoCategoria === 'ICMBio'
              ? ' <span style="display:inline-block; background:#16635a; color:#fff; font-size:10px; font-weight:700; padding:2px 6px; border-radius:3px;">ICMBio</span>'
              : '';
          return `
          <div style="margin:12px 0; padding:12px; background:#f8f9fa; border-left:3px solid #e74c3c; border-radius:4px;">
            <div style="font-size:12px; color:#666; margin-bottom:4px;">${pub.tipo} &mdash; ${pub.data}${seloICMBio}</div>
            <div style="font-weight:600; margin-bottom:4px;">${pub.titulo || '(sem titulo)'}</div>
            <div style="font-size:12px; color:#555; margin-bottom:6px;">${pub.orgaoStr}</div>
            <div style="font-size:13px; color:#333; margin-bottom:8px;">${pub.resumo.slice(0, 300)}${pub.resumo.length > 300 ? '...' : ''}</div>
            <a href="${pub.link}" style="font-size:12px; color:#2980b9;">Ver no DOU &rarr;</a>
          </div>`;
        })
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

  // Secao de diarios estaduais — uma subsecao por UF (ex: SP/DOESP).
  // So aparece se houver algo novo.
  const blocosDiarios = Object.entries(relatorio.diariosEstaduais || {})
    .filter(([, dados]) => (dados.novas || []).length > 0)
    .map(([uf, dados]) => {
      const itens = dados.novas
        .map(
          (pub) => `
          <div style="margin:12px 0; padding:12px; background:#f4f7f6; border-left:3px solid #16a085; border-radius:4px;">
            <div style="font-size:12px; color:#666; margin-bottom:4px;">${pub.tipo} &mdash; ${pub.data}</div>
            <div style="font-weight:600; margin-bottom:4px;">${pub.titulo || '(sem titulo)'}</div>
            <div style="font-size:12px; color:#555; margin-bottom:6px;">${pub.empresaConfig || ''}${pub.cnpj ? ` &mdash; CNPJ: ${pub.cnpj}` : ''}</div>
            <div style="font-size:12px; color:#555; margin-bottom:6px;">${pub.orgaoStr || ''}</div>
            <div style="font-size:13px; color:#333; margin-bottom:8px;">${(pub.resumo || '').slice(0, 300)}${(pub.resumo || '').length > 300 ? '...' : ''}</div>
            <a href="${pub.link}" style="font-size:12px; color:#16a085;">Ver no diario &rarr;</a>
          </div>`
        )
        .join('');
      return `
        <div style="margin-bottom:24px;">
          <h3 style="margin:16px 0 8px; color:#16a085;">${dados.nome || 'Diario estadual'} (${uf})</h3>
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

  const secaoDiarios = t.diarios > 0
    ? `<h2 style="margin:24px 0 16px; color:#2c3e50; font-size:18px; border-top:1px solid #eee; padding-top:16px;">Diarios Oficiais Estaduais</h2>${blocosDiarios}`
    : '';

  return `
    <!DOCTYPE html>
    <html>
    <body style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:20px;color:#333;">
      <div style="background:#2c3e50;color:white;padding:20px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;">Monitor de Licencas Ambientais</h2>
        <div style="font-size:14px;opacity:0.8;margin-top:4px;">${relatorio.clienteNome ? `${relatorio.clienteNome} &mdash; ` : ''}${relatorio.data}</div>
      </div>

      <div style="background:white;border:1px solid #ddd;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
        <div style="background:#fef9e7;border:1px solid #f39c12;padding:12px;border-radius:6px;margin-bottom:24px;">
          <strong style="color:#e67e22;">&#9888; ${t.total} alerta(s) novo(s)</strong>
          &mdash; ${t.dou} do DOU, ${t.ibama} do IBAMA, ${t.diarios} de diarios estaduais
        </div>

        ${secaoDOU}
        ${secaoIBAMA}
        ${secaoDiarios}

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

module.exports = { enviarAlerta, gerarHtml, contarAlertas };
