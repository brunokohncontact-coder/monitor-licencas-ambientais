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

// (a) Config legado (empresas[] no topo) e sintetizado em 1 cliente "default".
test('config legado empresas[] sintetiza cliente default (retrocompat R11)', () => {
  const configPath = arquivoTemp('config', {
    empresas: [{ nome: 'Empresa A', cnpj: '12.345.678/0001-00', ativa: true }],
    alerta: { ativo: true, para: ['dest@exemplo.com'] },
  });
  const localPath = path.join(os.tmpdir(), `inexistente-${Date.now()}.json`);

  const cfg = carregarConfig({ configPath, localPath });
  assert.strictEqual(Array.isArray(cfg.clientes), true);
  assert.strictEqual(cfg.clientes.length, 1);
  assert.strictEqual(cfg.clientes[0].id, 'default');
  assert.strictEqual(cfg.clientes[0].nome, 'Cliente Padrao');
  assert.strictEqual(cfg.clientes[0].ativo, true);
  assert.deepStrictEqual(cfg.clientes[0].alerta.para, ['dest@exemplo.com']);
  assert.strictEqual(cfg.clientes[0].empresas.length, 1);

  fs.unlinkSync(configPath);
});

// (b) Config novo com clientes[] e lido corretamente sem alteracao.
test('config novo com clientes[] e lido corretamente', () => {
  const configPath = arquivoTemp('config', {
    clientes: [
      {
        id: 'cli1',
        nome: 'Cliente Um',
        ativo: true,
        empresas: [{ nome: 'Empresa B', cnpj: '98.765.432/0001-00', ativa: true }],
        alerta: { para: ['cli1@exemplo.com'] },
      },
    ],
    filtro: { tiposRelevantes: ['Licenca'] },
    agendamento: { cron: '0 8 * * 1-5' },
    alerta: { ativo: true, de: 'from@exemplo.com' },
    ibama: { ativo: false },
  });
  const localPath = path.join(os.tmpdir(), `inexistente-${Date.now()}.json`);

  const cfg = carregarConfig({ configPath, localPath });
  assert.strictEqual(Array.isArray(cfg.clientes), true);
  assert.strictEqual(cfg.clientes.length, 1);
  assert.strictEqual(cfg.clientes[0].id, 'cli1');
  assert.strictEqual(cfg.clientes[0].nome, 'Cliente Um');
  assert.deepStrictEqual(cfg.clientes[0].alerta.para, ['cli1@exemplo.com']);

  fs.unlinkSync(configPath);
});

// (c) config.local.json sobrepoe secoes do config.json base, secao a secao.
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
