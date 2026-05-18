// Agendador do monitor — mantem o processo rodando e dispara o monitor
// automaticamente todo dia util (seg-sex) as 8h da manha.
//
// Como usar:
//   node cron.js          <- inicia o agendador (deixe o terminal aberto)
//
// Para parar: Ctrl+C no terminal.

const cron = require('node-cron');
const { executarMonitor } = require('./monitor');

const SCHEDULE = require('./config.json').agendamento.cron; // "0 8 * * 1-5"

console.log('Monitor de Licencas Ambientais — agendador iniciado.');
console.log(`Agenda: "${SCHEDULE}" (todo dia util as 8h)`);
console.log('Aguardando proximo disparo. Pressione Ctrl+C para parar.\n');

cron.schedule(SCHEDULE, async () => {
  console.log(`[${new Date().toLocaleString('pt-BR')}] Disparando monitoramento...`);
  try {
    await executarMonitor();
  } catch (err) {
    console.error('Erro durante o monitoramento:', err.message);
  }
});

// Mantendo o processo vivo.
// O node-cron ja faz isso internamente, mas este log confirma que esta rodando.
process.on('SIGINT', () => {
  console.log('\nAgendador encerrado.');
  process.exit(0);
});
