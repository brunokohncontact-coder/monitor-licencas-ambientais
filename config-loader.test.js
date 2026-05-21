// Testes do carregador de configuracao (config-loader.js).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { carregarConfig } = require('./config-loader');

// Cria um arquivo JSON temporario e devolve o caminho.
function arquivoTemp(rotulo, conteudo) {
  const nome = `cfgtest-${Date.now()}-${Math.random().toString(36).slice(2)}-${rotulo}.json`;
  const caminho = path.join(os.tmpdir(), nome);
  fs.writeFileSync(caminho, JSON.stringify(conteudo));
  return caminho;
}

test('le o config.json quando nao ha config.local.json', () => {
  const configPath = arquivoTemp('config', {
    empresas: [{ nome: 'Empresa A' }],
    alerta: { ativo: true },
  });
  const localPath = path.join(os.tmpdir(), `inexistente-${Date.now()}.json`);

  const cfg = carregarConfig({ configPath, localPath });
  assert.strictEqual(cfg.alerta.ativo, true);
  assert.strictEqual(cfg.empresas.length, 1);

  fs.unlinkSync(configPath);
});

test('mescla config.local.json por cima, secao a secao', () => {
  const configPath = arquivoTemp('config', {
    alerta: { ativo: true, resendApiKey: '' },
    ibama: { ativo: true },
  });
  const localPath = arquivoTemp('local', {
    alerta: { resendApiKey: 'segredo-123' },
  });

  const cfg = carregarConfig({ configPath, localPath });
  // A chave definida no local sobrepoe a do base...
  assert.strictEqual(cfg.alerta.resendApiKey, 'segredo-123');
  // ...mas as demais chaves da mesma secao sao preservadas...
  assert.strictEqual(cfg.alerta.ativo, true);
  // ...e secoes nao mencionadas no local ficam intactas.
  assert.strictEqual(cfg.ibama.ativo, true);

  fs.unlinkSync(configPath);
  fs.unlinkSync(localPath);
});
