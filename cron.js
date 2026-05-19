// Agendador do monitor — mantem o processo rodando e dispara o monitor
// automaticamente todo dia util (seg-sex) as 8h da manha.
//
// Como usar:
//   node cron.js          <- inicia o agendador (deixe o terminal aberto)
//
// Para parar: Ctrl+C no terminal.

const cron = require('node-cron');
const { executarMonitor, config } = require('./monitor');
const { enviarAlertaFalha } = require('./alerta');

// Usa o config do monitor (ja mesclado com config.local.json, que guarda a chave Resend).
const SCHEDULE = config.agendamento.cron; // "0 8 * * 1-5"

console.log('Monitor de Licencas Ambientais — agendador iniciado.');
console.log(`Agenda: "${SCHEDULE}" (todo dia util as 8h)`);
console.log('Aguardando proximo disparo. Pressione Ctrl+C para parar.\n');

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

// Mantendo o processo vivo.
// O node-cron ja faz isso internamente, mas este log confirma que esta rodando.
process.on('SIGINT', () => {
  console.log('\nAgendador encerrado.');
  process.exit(0);
});
