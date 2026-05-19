#!/bin/bash
set -euo pipefail

# Roda apenas no ambiente remoto (code.claude.com).
# Na maquina local do usuario o signing pode funcionar normalmente.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# O servidor de signing do ambiente remoto retorna "missing source" (400),
# bloqueando todos os commits. Desabilita globalmente para esta sessao.
git config --global commit.gpgsign false

# Instala dependencias Node.js para que imports e linting funcionem.
# O binario do Chromium (Playwright) nao e baixado aqui porque cdn.playwright.dev
# esta bloqueado pela politica de rede cloud_default — e desnecessario para
# edicao de codigo; o monitor roda na maquina local do usuario.
cd "${CLAUDE_PROJECT_DIR}"
npm install
