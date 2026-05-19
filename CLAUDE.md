# CLAUDE.md — Monitor de Licenças Ambientais

Instruções para o Claude Code trabalhar neste repositório. Mantenha curto e atualizado.

## O que é este projeto

Agente que monitora publicações ambientais no **DOU** (Diário Oficial da União) e em **dados abertos do IBAMA** (autos de infração e termos de embargo) para uma lista de empresas/CNPJs e envia alerta por e-mail quando aparece algo novo.

Produto B2B em estágio inicial. O usuário (Bruno) é ops digitais, não-dev. Prefere explicações passo a passo com o porquê de cada decisão.

## Stack

- Node.js (CommonJS, `"type": "commonjs"`)
- `playwright` (Chromium headless) — scraping do portal do DOU
- `better-sqlite3` — banco de deduplicação local (`dedup.db`)
- `adm-zip` + `csv-parse` (streaming) — IBAMA dados abertos
- `resend` — envio de e-mail
- `node-cron` — agendamento
- Sem build, sem TypeScript, sem testes formais (há scripts `teste-*.js` ad-hoc)

## Mapa dos arquivos

| Arquivo | Papel |
|---|---|
| [monitor.js](monitor.js) | Pipeline principal. Roda DOU + IBAMA, dedup, imprime relatório, dispara alerta. |
| [cron.js](cron.js) | Agendador (dias úteis 8h, configurável). |
| [dou.js](dou.js) | Busca no portal `in.gov.br/consulta/-/buscar/dou` via Playwright. |
| [dou-scraper.js](dou-scraper.js) / [dou-extrator.js](dou-extrator.js) | Auxiliares/experimentos de scraping do DOU. |
| [ibama.js](ibama.js) | Baixa zips do `dadosabertos.ibama.gov.br` com `If-Modified-Since`, parseia CSV em stream, filtra por CNPJ. |
| [dedup.js](dedup.js) | SQLite (`alertas_enviados`, PK composta `(fonte, classPK)`). Inclui migração de schema antigo. |
| [alerta.js](alerta.js) | Monta HTML do e-mail e envia pelo Resend. |
| [log.js](log.js) | Tee de `console.log` para arquivo por execução. |
| [config.json](config.json) | Empresas monitoradas, filtros, agendamento, alerta, fontes IBAMA. |
| [config.local.example.json](config.local.example.json) | Modelo do `config.local.json` (chave Resend, fica fora do git). |
| [teste-dedup.js](teste-dedup.js) / [teste-http.js](teste-http.js) | Scripts manuais de verificação. |

## Como rodar

```powershell
node monitor.js              # roda uma vez para hoje
node monitor.js 15-05-2026   # roda para data específica (dd-MM-yyyy)
node cron.js                 # mantém processo vivo, dispara no horário do config
```

A primeira execução baixa os zips do IBAMA em `ibama-cache/`. Execuções seguintes reusam via `If-Modified-Since` (304). O banco fica em `dedup.db` na raiz.

## Convenções importantes

- **Idioma**: código, comentários, logs e e-mails são em **português**. Mantenha assim.
- **Sem acentos em strings de log** — saída no terminal Windows pode quebrar. Veja os exemplos no código (`Licencas`, `cao`).
- **Comentários explicam o *porquê***, não o quê. Siga o estilo já existente: blocos curtos no topo de cada função/seção descrevendo a decisão. Não removê-los nem inflá-los.
- **PowerShell 5.x**: sem `&&` entre comandos. Use `;` ou `if ($?) { ... }`. `curl` no PS é alias de `Invoke-WebRequest` — não confiar.
- **Datas**: o DOU usa `dd-MM-yyyy`. O IBAMA usa `yyyy-MM-dd`. Não normalize na entrada/saída do `monitor.js` — cada módulo cuida do seu formato.
- **CNPJ**: comparar sempre via `normalizarCNPJ()` (só dígitos). O usuário pode digitar com pontuação no `config.json`.
- **Busca no DOU**: termo vai entre aspas (`"43.776.491/0001-70"`) para forçar match exato. Sem aspas, o portal tokeniza e retorna lixo.
- **Variabilidade do DOU**: o portal pode retornar contagens diferentes para a mesma busca/data em execuções próximas. Não tratar isso como bug determinístico — investigar com cuidado antes de "consertar".
- **Dedup**: marca como alertado *só depois* do envio bem-sucedido do e-mail. Se o e-mail falhar, a próxima execução reenvia. Não inverter essa ordem.
- **Segredos**: `config.local.json` está no `.gitignore`. Nunca commitar a chave Resend ou outros valores em `config.json`.

## Antes de mudar coisa sensível

- Não derrubar `dedup.db` sem perguntar — perde o histórico de alertas e reenvia tudo.
- Não rodar `npm install` adicionando dependência nova sem confirmar com o usuário.
- Não mexer em `config.json` (empresas, e-mails de destino) sem confirmação explícita — é configuração de cliente.
- Mudanças no schema da tabela `alertas_enviados` precisam de migração idempotente no estilo do `migrarSeNecessario()` em [dedup.js](dedup.js).

## Estado atual

Fase 2 completa (commit inicial `dd36def`): DOU + IBAMA + dedup + alerta por e-mail + cron. Veja [ROADMAP.md](ROADMAP.md) para o que vem.
