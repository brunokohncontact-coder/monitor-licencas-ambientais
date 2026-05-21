// Carregador de configuracao — le config.json e mescla config.local.json
// (segredos, fora do git) por cima, secao a secao.
//
// Tambem normaliza o formato: o sistema trabalha sempre com uma lista de
// clientes (config.clientes). Um config.json no formato antigo (mono-cliente,
// com empresas[] e alerta.para no topo) e convertido automaticamente para um
// unico cliente "default" — assim configs da Fase 2 continuam funcionando
// sem precisar de edicao.

const fs = require('fs');
const path = require('path');

const RAIZ = __dirname;

// Garante que config.clientes exista.
// - Formato novo (ja tem clientes[]): mantido como esta.
// - Formato antigo (empresas[] no topo): sintetiza um unico cliente "default"
//   com as empresas e o destinatario de e-mail legados.
// - Nenhum dos dois: devolve lista de clientes vazia.
function normalizarConfig(config) {
  if (Array.isArray(config.clientes)) {
    return config;
  }

  if (Array.isArray(config.empresas)) {
    const paraLegado =
      config.alerta && Array.isArray(config.alerta.para) ? config.alerta.para : [];
    config.clientes = [
      {
        id: 'default',
        nome: 'Cliente Padrao',
        ativo: true,
        empresas: config.empresas,
        alerta: { para: paraLegado },
      },
    ];
    return config;
  }

  config.clientes = [];
  return config;
}

// Le o config.json base e, se config.local.json existir, sobrepoe os valores
// dele secao a secao (o local so substitui as chaves que define).
// opcoes.configPath / opcoes.localPath permitem apontar outros arquivos —
// usado pelos testes; em producao os padroes apontam para a raiz do projeto.
function carregarConfig(opcoes = {}) {
  const configPath = opcoes.configPath || path.join(RAIZ, 'config.json');
  const localPath = opcoes.localPath || path.join(RAIZ, 'config.local.json');

  const base = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  if (fs.existsSync(localPath)) {
    const local = JSON.parse(fs.readFileSync(localPath, 'utf-8'));
    for (const [secao, valores] of Object.entries(local)) {
      base[secao] = { ...(base[secao] || {}), ...valores };
    }
  }

  return normalizarConfig(base);
}

module.exports = { carregarConfig, normalizarConfig };
