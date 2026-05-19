// Agendador do monitor — mantem o processo rodando e dispara o monitor
// automaticamente todo dia util (seg-sex) as 8h da manha.
//
// Como usar:
//   node cron.js          <- inicia o agendador (deixe o terminal aberto)
//
// Para parar: Ctrl+C no terminal.

const cron = require('node-cron');
const { executarMonitor, config } = require('./monitor');
const { enviarAlertaFalha, enviarResumoCatchUp } = require('./alerta');
const { inicializarDB, listarExecucoes } = require('./dedup');

// Usa o config do monitor (ja mesclado com config.local.json, que guarda a chave Resend).
const SCHEDULE = config.agendamento.cron; // "0 8 * * 1-5"

// Limite de dias uteis que o catch-up tenta recuperar de uma vez.
// Evita que uma maquina parada ha meses gere uma rajada gigante de execucoes
// e e-mails. Se passar disso, o aviso na UI orienta a rodar manualmente.
const LIMITE_CATCH_UP = 14;

// Converte uma string dd-MM-yyyy em Date (meia-noite local).
function parseDDMMYYYY(s) {
  const [dia, mes, ano] = s.split('-').map(Number);
  return new Date(ano, mes - 1, dia);
}

// Converte um Date em string dd-MM-yyyy (mesmo formato usado pelo DOU).
function formatarDDMMYYYY(d) {
  return d.toLocaleDateString('pt-BR').split('/').join('-');
}

// Detecta dias uteis nao processados entre a primeira execucao registrada
// e hoje. Roda o monitor para cada um deles em sequencia e envia um e-mail
// de resumo no fim.
//
// Premissa: monitor.registrarExecucao gravou a data toda vez que rodou ate
// o fim. Se a tabela esta vazia (primeira instalacao), nao faz catch-up —
// o agendador comeca a registrar a partir do primeiro disparo.
async function verificarCatchUp() {
  const db = inicializarDB();
  const execucoes = listarExecucoes(db);
  db.close();

  if (execucoes.length === 0) {
    console.log('Catch-up: nenhuma execucao previa registrada. Comecando do zero.');
    return;
  }

  const datasExecutadas = new Set(execucoes.map((e) => e.data));
  const datasOrdenadas = [...datasExecutadas].sort(
    (a, b) => parseDDMMYYYY(a) - parseDDMMYYYY(b)
  );
  const primeira = parseDDMMYYYY(datasOrdenadas[0]);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  // Lista dias uteis (seg-sex) faltando entre a primeira execucao e hoje.
  // Pula fim de semana porque o DOU nao publica.
  const faltando = [];
  const cursor = new Date(primeira);
  cursor.setDate(cursor.getDate() + 1); // pula o proprio dia da primeira execucao
  while (cursor <= hoje) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) {
      const dataStr = formatarDDMMYYYY(cursor);
      if (!datasExecutadas.has(dataStr)) {
        faltando.push(dataStr);
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  if (faltando.length === 0) {
    console.log('Catch-up: sem dias uteis pendentes.');
    return;
  }

  let truncado = false;
  if (faltando.length > LIMITE_CATCH_UP) {
    console.log(
      `Catch-up: ${faltando.length} dias uteis pendentes — limitando aos ultimos ${LIMITE_CATCH_UP}.`
    );
    truncado = true;
    faltando.splice(0, faltando.length - LIMITE_CATCH_UP);
  }

  console.log(`Catch-up: recuperando ${faltando.length} dia(s) util(eis): ${faltando.join(', ')}`);

  // Roda em sequencia (nao em paralelo) — IBAMA usa cache compartilhado e
  // dois processos batendo no mesmo zip ao mesmo tempo pode dar problema.
  const resumos = [];
  for (const data of faltando) {
    console.log(`\n[Catch-up] Rodando ${data}...`);
    try {
      const rel = await executarMonitor({ data });
      if (!rel) {
        // executarMonitor devolve null em fim de semana, mas ja pulamos isso acima.
        // Defensivo: trata como dia sem alertas.
        resumos.push({ data, total: 0, dou: 0, ibama: 0, erro: null });
        continue;
      }
      const dou = rel.resultados.reduce((acc, r) => acc + r.relevantes.length, 0);
      const ibama = Object.values(rel.ibama || {}).reduce(
        (acc, f) => acc + (f.novas?.length || 0),
        0
      );
      resumos.push({ data, total: dou + ibama, dou, ibama, erro: null });
    } catch (err) {
      console.error(`[Catch-up] Falha em ${data}: ${err.message}`);
      resumos.push({ data, total: 0, dou: 0, ibama: 0, erro: err.message });
    }
  }

  const cfgAlerta = config.alerta || {};
  if (cfgAlerta.ativo) {
    await enviarResumoCatchUp(resumos, { truncado }, {
      apiKey: cfgAlerta.resendApiKey,
      de: cfgAlerta.de,
      para: cfgAlerta.para,
    }).catch((e) => console.error('Falha ao enviar resumo de catch-up:', e.message));
  }
}

async function main() {
  console.log('Monitor de Licencas Ambientais — agendador iniciado.');
  console.log(`Agenda: "${SCHEDULE}" (todo dia util as 8h)`);

  // Primeiro: recupera dias uteis pulados. Roda ANTES de armar o agendador
  // para evitar que um disparo agendado colida com o catch-up no mesmo banco.
  try {
    await verificarCatchUp();
  } catch (err) {
    console.error('Erro no catch-up:', err.message);
  }

  console.log('\nAguardando proximo disparo. Pressione Ctrl+C para parar.\n');

  cron.schedule(SCHEDULE, async () => {
    console.log(`[${new Date().toLocaleString('pt-BR')}] Disparando monitoramento...`);
    try {
      await executarMonitor();
    } catch (err) {
      console.error('Erro durante o monitoramento:', err.message);
      // Envia alerta por e-mail para que o operador saiba que o monitor caiu.
      // O catch interno garante que uma falha no envio nao derrube o processo do cron.
      const cfgAlerta = config.alerta || {};
      if (cfgAlerta.ativo) {
        await enviarAlertaFalha(err, {
          apiKey: cfgAlerta.resendApiKey,
          de: cfgAlerta.de,
          para: cfgAlerta.para,
        }).catch((e) => console.error('Falha ao enviar alerta de falha:', e.message));
      }
    }
  });
}

// Mantendo o processo vivo.
// O node-cron ja faz isso internamente, mas este log confirma que esta rodando.
process.on('SIGINT', () => {
  console.log('\nAgendador encerrado.');
  process.exit(0);
});

main().catch((err) => {
  console.error('Erro fatal no agendador:', err);
  process.exit(1);
});
