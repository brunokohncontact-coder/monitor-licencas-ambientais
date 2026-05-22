// Testes do modulo de log (log.js) — funcao limparLogsAntigos.
// Usa um diretorio temporario para nao tocar no logs/ real e nao
// depender de arquivos pre-existentes. A funcao aceita _dir como segundo
// argumento para facilitar os testes sem redefinir o modulo.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { limparLogsAntigos } = require('./log');

// Cria um arquivo de log simulado com mtime ajustado para simular envelhecimento.
function criarArquivoLog(dir, nome, mtime) {
  const caminho = path.join(dir, nome);
  fs.writeFileSync(caminho, 'conteudo de teste\n');
  fs.utimesSync(caminho, mtime, mtime);
  return caminho;
}

test('limparLogsAntigos: apaga arquivo mais antigo que o limite', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'monitor-log-test-'));
  try {
    // Arquivo com 35 dias de vida — deve ser removido com limite de 30 dias.
    const trintaECincoDiasAtras = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
    const caminho = criarArquivoLog(tmpDir, '2026-04-10.log', trintaECincoDiasAtras);

    limparLogsAntigos(30, tmpDir);

    assert.ok(!fs.existsSync(caminho), 'arquivo antigo deve ter sido removido');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('limparLogsAntigos: preserva arquivo mais recente que o limite', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'monitor-log-test-'));
  try {
    // Arquivo com 5 dias de vida — deve ser mantido com limite de 30 dias.
    const cincoDiasAtras = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const caminho = criarArquivoLog(tmpDir, '2026-05-17.log', cincoDiasAtras);

    limparLogsAntigos(30, tmpDir);

    assert.ok(fs.existsSync(caminho), 'arquivo recente deve ter sido preservado');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('limparLogsAntigos: nao remove arquivo que nao segue o padrao de nome', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'monitor-log-test-'));
  try {
    // Arquivo com nome invalido — nunca deve ser removido, mesmo sendo antigo.
    const antigamente = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const caminho = criarArquivoLog(tmpDir, 'outro-arquivo.txt', antigamente);

    limparLogsAntigos(30, tmpDir);

    assert.ok(fs.existsSync(caminho), 'arquivo fora do padrao de nome deve ser preservado');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('limparLogsAntigos: nao lanca excecao com diasReter invalido', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'monitor-log-test-'));
  try {
    // Parametros invalidos devem cair no default (30 dias), sem excepcao.
    assert.doesNotThrow(() => limparLogsAntigos(0, tmpDir));
    assert.doesNotThrow(() => limparLogsAntigos(null, tmpDir));
    assert.doesNotThrow(() => limparLogsAntigos(-5, tmpDir));
    assert.doesNotThrow(() => limparLogsAntigos(undefined, tmpDir));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('limparLogsAntigos: nao lanca excecao quando o diretorio nao existe', () => {
  const tmpDir = path.join(os.tmpdir(), 'monitor-log-inexistente-' + Date.now());
  // O diretorio nunca foi criado — a funcao deve retornar silenciosamente.
  assert.doesNotThrow(() => limparLogsAntigos(30, tmpDir));
});

test('limparLogsAntigos: deleta arquivo antigo, preserva recente na mesma execucao', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'monitor-log-test-'));
  try {
    const old = path.join(dir, '2020-01-01.log');
    const recent = path.join(dir, '2099-12-31.log');
    fs.writeFileSync(old, 'conteudo antigo');
    fs.writeFileSync(recent, 'conteudo recente');
    const past = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    fs.utimesSync(old, past, past);
    limparLogsAntigos(30, dir);
    assert.ok(!fs.existsSync(old), 'arquivo antigo deve ser deletado');
    assert.ok(fs.existsSync(recent), 'arquivo recente deve ser mantido');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
