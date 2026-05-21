// Carregador de configuracao — le config.json e mescla config.local.json
// (segredos, fora do git) por cima, secao a secao.
//
// Extraido de monitor.js para poder ser testado de forma isolada e
// reaproveitado por outros pontos do sistema (ex: o painel web, na Etapa 4).

const fs = require('fs');
const path = require('path');

const RAIZ = __dirname;

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

  return base;
}

module.exports = { carregarConfig };
