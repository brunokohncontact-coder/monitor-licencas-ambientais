// Modulo de log em arquivo — espelha tudo que vai para o console
// para um arquivo diario em logs/YYYY-MM-DD.log.
//
// Por que monkey-patch do console: o codigo existente ja usa console.log
// em varios lugares (monitor, alerta, dou). Reescrever todos para usar
// um logger seria muito ruido. Substituindo o console aqui, qualquer
// console.log/error/warn vira tambem uma linha no arquivo.

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, 'logs');

let stream = null;
let originais = null;

// Nome do arquivo do dia no formato YYYY-MM-DD.log (data local do servidor).
function nomeArquivoDoDia() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}.log`;
}

// Formata args do console em string unica, como o console nativo faria.
// Erros viram stack trace; objetos viram JSON.
function formatarArgs(args) {
  return args
    .map((a) => {
      if (a instanceof Error) return a.stack || a.message;
      if (typeof a === 'object' && a !== null) {
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      }
      return String(a);
    })
    .join(' ');
}

// Abre o stream de log e substitui console.log/warn/error.
// Idempotente — chamar duas vezes nao quebra (a segunda e ignorada).
function iniciar() {
  if (stream) return;

  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }

  const arquivo = path.join(LOG_DIR, nomeArquivoDoDia());
  stream = fs.createWriteStream(arquivo, { flags: 'a' });

  // Marca o inicio da execucao no log para facilitar separar rodadas.
  stream.write(`\n--- Nova execucao iniciada em ${new Date().toISOString()} ---\n`);

  originais = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };

  const escrever = (nivel, args) => {
    const ts = new Date().toISOString();
    const linha = `[${ts}] ${nivel.padEnd(5)} ${formatarArgs(args)}\n`;
    if (stream) stream.write(linha);
  };

  console.log = (...args) => {
    originais.log.apply(console, args);
    escrever('INFO', args);
  };
  console.warn = (...args) => {
    originais.warn.apply(console, args);
    escrever('WARN', args);
  };
  console.error = (...args) => {
    originais.error.apply(console, args);
    escrever('ERROR', args);
  };

  return arquivo;
}

// Restaura console nativo e fecha o stream. Seguro chamar sem ter iniciado.
function fechar() {
  if (!stream) return;
  if (originais) {
    console.log = originais.log;
    console.warn = originais.warn;
    console.error = originais.error;
    originais = null;
  }
  stream.end();
  stream = null;
}

module.exports = { iniciar, fechar, LOG_DIR };
