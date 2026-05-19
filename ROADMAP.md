# ROADMAP — Monitor de Licenças Ambientais

Visão evolutiva do produto. Cada fase tem um objetivo claro de validação antes de seguir.

> **Status atual:** Fase 2 concluída. Em validação antes de avançar para a Fase 3. (verificado em 2026-05-18)

---

## ✅ Fase 1 — Coletar do DOU (concluída)

**Objetivo:** confirmar que dá para extrair publicações do DOU de forma confiável, por CNPJ, todo dia.

- [x] Scraping do portal `in.gov.br/consulta/-/buscar/dou` via Playwright
- [x] Busca por CNPJ com aspas (match exato)
- [x] Paginação (até 3 páginas × 75 itens)
- [x] Normalização das publicações (tipo, órgão, título, resumo, link, classPK)
- [x] Filtro por tipo e por palavra-chave (configurável em `config.json`)
- [x] Detecção de fim de semana (DOU não publica)

**Critério de validação:** rodar manualmente por alguns dias e conferir que as publicações trazidas batem com o que aparece no portal. ✓

---

## ✅ Fase 2 — Operação automática diária (concluída)

**Objetivo:** transformar o coletor num agente que roda sozinho e avisa por e-mail.

- [x] Pipeline `monitor.js` orquestrando DOU + IBAMA
- [x] Integração com **IBAMA dados abertos** (autos de infração + termos de embargo)
  - Download condicional por `If-Modified-Since` em [ibama.js](ibama.js)
  - CSV parseado em streaming (necessário para o embargo de ~170 MB)
  - Cache local em `ibama-cache/`
- [x] Deduplicação em SQLite com PK composta `(fonte, classPK)` — [dedup.js](dedup.js)
  - Migração idempotente do schema antigo (sem coluna `fonte`)
- [x] Alerta por e-mail via Resend — [alerta.js](alerta.js)
  - Só envia se houver alerta novo
  - Marca como alertado **só após** envio bem-sucedido (reentrante)
- [x] Agendamento por cron (dias úteis 8h) — [cron.js](cron.js)
- [x] Relatório em JSON por dia + log de cada execução

**Critério de validação:** rodar em produção por 1–2 semanas com 1 ou 2 empresas de teste. Conferir:
- Nenhum alerta repetido
- Nenhuma publicação relevante perdida (amostragem manual no portal)
- E-mail chega legível em desktop e mobile
- Cache do IBAMA reusa via 304 nas execuções subsequentes

---

## ⏳ Fase 3 — Confiabilidade e observabilidade

**Objetivo:** rodar sem babá. Saber rápido quando algo quebra.

Candidatos (priorizar conforme o que aparecer durante a Fase 2):

- [~] **Alerta de falha**: e-mail/telegram quando o monitor cai ou pula execução
  - [x] E-mail quando `executarMonitor()` lanca excecao (catch no cron.js → `enviarAlertaFalha`)
  - [ ] Deteccao de execucao pulada (heartbeat): registrar timestamp da ultima execucao e checar na inicializacao, ou integrar com servico externo como healthchecks.io
- [ ] **Heartbeat**: registrar cada execução bem-sucedida (mesmo sem alerta) num log estruturado ou serviço tipo healthchecks.io
- [ ] **Retry inteligente** no DOU quando o portal devolve contagem zero suspeita (a variabilidade conhecida do DOU pode mascarar falhas reais)
- [ ] **Resumo semanal** consolidando o que rolou nos 7 dias (mesmo quando não houve alerta)
- [ ] **Métricas básicas**: quantas publicações por dia, taxa de match, tempo de execução

---

## ⏳ Fase 4 — Cobertura ampliada

**Objetivo:** monitorar mais fontes que importam para licenciamento ambiental.

Candidatos a investigar (escolher 1–2 por sprint, validar com cliente):

- [ ] **Diários oficiais estaduais** prioritários (SP, MG, RJ, PR…)
- [ ] **CETESB** (SP) — consulta de licenças/processos
- [ ] **IBAMA SISCOM / SIGA** — outros datasets além de autos e embargos
- [ ] **ICMBio** — autuações em unidades de conservação
- [ ] **ANA** — outorgas de uso de recursos hídricos
- [ ] **Diário da Justiça** — ações civis públicas ambientais

Cada fonte nova: começar como módulo isolado seguindo o padrão de [ibama.js](ibama.js) (ou [dou.js](dou.js) para scraping).

---

## ⏳ Fase 5 — Produto multi-cliente

**Objetivo:** sair do "1 cliente, 1 instância" e virar SaaS.

Discutir com Bruno antes de começar. Decisões em aberto:

- [ ] **Persistência multi-tenant**: cada cliente com sua lista de empresas, e-mails, filtros
- [ ] **Interface** (web simples? Painel admin? Configuração só por arquivo?)
- [ ] **Onboarding** de novo cliente (importar CNPJs em lote)
- [ ] **Faturamento** / controle de uso
- [ ] **Trilha de auditoria** (relatórios assinados, exportáveis)
- [ ] **Hospedagem** — sair do desktop local para servidor (VPS, Railway, Fly…)

---

## Princípios para evoluir o roadmap

- **Validar antes de avançar.** Cada fase só termina quando tem prova de funcionamento.
- **Não somar features especulativas.** Se um item da Fase 3+ não tem cliente pedindo ou problema concreto, fica em backlog.
- **Não construir abstração antes da terceira repetição.** Hoje temos DOU e IBAMA — só vale extrair "framework de fontes" depois da terceira fonte.
- **Documentar decisões não-óbvias direto no código** (estilo dos comentários em [ibama.js](ibama.js) e [dedup.js](dedup.js)), não em docs separados.

---

_Atualizar este arquivo sempre que uma fase mudar de status ou um item novo entrar/sair. Quem mexer, ajusta a data implícita pelo commit._

---

## Notas de execução

### 2026-05-19 — Alerta de falha (sub-item 1: e-mail quando monitor cai)

**Tarefa:** implementar envio de e-mail quando `executarMonitor()` lanca excecao no cron.

**O que foi feito:**
- `alerta.js`: adicionada funcao `enviarAlertaFalha(erro, opcoes)` — monta HTML de falha e envia via Resend. Exportada junto com `enviarAlerta`.
- `monitor.js`: adicionado `config` ao `module.exports` para que outros modulos usem a versao mesclada com `config.local.json` sem duplicar a logica de merge.
- `cron.js`: importa `enviarAlertaFalha` e `config` do monitor. No bloco `catch` do cron, chama `enviarAlertaFalha` se `cfgAlerta.ativo` for verdadeiro.
- `ROADMAP.md`: item desmembrado em sub-itens; primeiro marcado como `[x]`.

**Bloqueio — commit nao realizado:**
O servidor de assinatura de commits (`/tmp/code-sign`) retornou status 400 `missing source` em todas as tentativas. O erro ocorre mesmo em chamadas diretas ao binario, independente da mensagem de commit. Nao e possivel corrigir isso de dentro da sessao.

**Para finalizar manualmente (quando o signing estiver funcionando):**
```
git add alerta.js cron.js monitor.js ROADMAP.md
git commit -m "feat: alerta por e-mail quando monitor cai com excecao"
git push origin main
```
Os arquivos ja estao staged (git add foi executado).
