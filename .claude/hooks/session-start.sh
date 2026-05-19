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

# Configura autenticacao GitHub via token para operacoes git CLI (push/pull).
# GH_TOKEN e o nome padrao usado pelo Claude Code on the web (documentacao oficial).
# Para ativar: abra o ambiente em code.claude.com > icone de nuvem > engrenagem
# do ambiente > campo "Environment variables" > adicione: GH_TOKEN=ghp_seutoken
# O token precisa de permissao "Contents: Read and write" no repositorio.
TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
if [ -n "$TOKEN" ]; then
  git config --global url."https://x-token:${TOKEN}@github.com/".insteadOf "https://github.com/"
fi

# Instala dependencias Node.js para que imports e linting funcionem.
# O binario do Chromium (Playwright) nao e baixado aqui porque cdn.playwright.dev
# esta bloqueado pela politica de rede cloud_default — e desnecessario para
# edicao de codigo; o monitor roda na maquina local do usuario.
cd "${CLAUDE_PROJECT_DIR}"
npm install
