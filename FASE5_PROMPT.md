# 🎯 Purpose

**O quê:** Implementar a **Fase 5 do Monitor de Licenciamento Ambiental** em
**3 etapas sequenciais** — (1) classificador de gravidade por regras,
(2) e-mail rico e acionável, (3) dashboard visual com urgência — sem quebrar
nenhuma funcionalidade das Fases anteriores.

**Por que importa:** O sistema hoje detecta publicações e envia alertas. Mas
todas as publicações chegam ao cliente com o mesmo peso visual — um auto de
infração (prazo de 20 dias, multa de até R$ 10 milhões) aparece idêntico a uma
portaria informativa. A Fase 5 dá **gravidade** a cada publicação: um
classificador baseado em regras determina se é crítica, alta, média ou baixa;
o e-mail passa a ter uma seção de "atenção imediata" em destaque; e o painel
mostra indicadores visuais de urgência. O resultado é um produto que o cliente
entende em segundos, sem precisar ler linha por linha.

**Definição de sucesso:** As 3 etapas concluídas e validadas. Ao final:
`npm test` passa; cada publicação em `relevantes[]` carrega um campo
`classificacao` com gravidade, prazo, ação e explicação; o e-mail HTML tem seção
de destaque para críticas/altas e badges coloridos por gravidade; o painel tem
cards de KPI no topo e publica ordenadas por gravidade no detalhe de relatório.
**Nada das Fases 2, 3 e 4 pode regredir.**

---

# 📁 Environment & Codebase Context

> **Leia esta seção inteira antes de escrever qualquer linha de código.
> O código passou pelas Fases 2, 3 e 4 — muita coisa já existe.
> NÃO reescreva o que já está pronto; apenas estenda.**

## Tech Stack
- **Runtime:** Node.js v24 (assuma **Node 20+** como mínimo).
- **Linguagem:** JavaScript puro, **CommonJS** (`require`/`module.exports`,
  `"type": "commonjs"`). **Sem TypeScript, sem ESM, sem build step.**
- **Scraping:** Playwright 1.60 (Chromium headless) — não usado na Fase 5.
- **Banco:** `better-sqlite3` 12 (arquivo `dedup.db`).
- **Web:** `express` 5 + `express-session` (painel).
- **E-mail:** `resend` 6 (HTML inline — sem CSS externo no e-mail).
- **Testes:** `node:test` nativo.
- **Plataforma alvo:** **Windows 10.** O claudiomiro roda no WSL/Ubuntu, mas o
  projeto vive em `/mnt/d/Claude/monitor de licenciamento`.

## Estrutura do Projeto (raiz: `D:\Claude\monitor de licenciamento`)

```
monitor.js          Pipeline principal — integrar chamada ao classificador aqui
dou.js              Busca no DOU (Playwright): buscarDOU()
ibama.js            Fontes IBAMA: buscarFonte(), FONTES
diario-estadual.js  Registry de diarios estaduais: DIARIOS, buscarDOESP()
icmbio.js           Categoriza publicacoes ICMBio dentro do DOU
dedup.js            Deduplicacao em SQLite, isolada por cliente_id
alerta.js           E-mail HTML via Resend: enviarAlerta(), gerarHtml() — ALTERAR aqui
config-loader.js    Le e mescla config.json + config.local.json
retry.js            Helper de retentativa: comRetentativa()
log.js              Log em arquivo: iniciar(), fechar(), limparLogsAntigos()
cron.js             Agendador node-cron (manter intacto)
painel.js           Servidor Express — alterar statusSistema() aqui
public/index.html   Tela principal do painel — ALTERAR (KPIs)
public/app.js       Frontend JS — ALTERAR (gravidade, KPIs, ordenacao)
public/style.css    CSS — ALTERAR (badges de gravidade, cards KPI, responsivo)
public/empresas.html Gerenciar empresas (manter intacto)
config.json         Configuracao global (manter intacto — nada novo nesta fase)
*.test.js           Suite de testes (89 testes passando agora)
```

**Arquivo novo a criar:**
```
classificador.js      Funcao pura classificarPublicacao(pub) — Etapa 1
classificador.test.js Testes do classificador — Etapa 1
```

## Padrão de Arquitetura
Monolito de **módulos planos** em CommonJS. Sem camadas/MVC. Cada módulo exporta
funções nomeadas. Sem frameworks de frontend — HTML/CSS/JS vanilla.

## Estado Atual Relevante (pós-Fase 4 — confirmado por leitura do código)

### `monitor.js`
- `executarMonitorInterno(opcoes, arquivoLog)` — orquestrador principal.
- Shape do relatório (produzido por `executarMonitorInterno`):
  ```
  {
    data: "DD-MM-YYYY",
    executadoEm: "<ISO 8601>",
    saude: { status, fontes, falhas },
    clientes: [
      {
        clienteId, clienteNome,
        resultados: [
          {
            empresa, cnpj,
            totalEncontradas: <int>,
            relevantes: [ <pub>, ... ],   // ← adicionar classificacao aqui
            jaAlertadas: [ <pub>, ... ],
            todas: [ <pub>, ... ],
            erro?: string,
            parcial?: boolean
          }
        ],
        ibama: {
          autos:    { novas: [...], jaAlertadas: [...], totalEncontradas, erro? },
          embargos: { novas: [...], jaAlertadas: [...], totalEncontradas, erro? }
        },
        diariosEstaduais: {
          SP: { fonte, nome, novas: [ <pub>, ... ], jaAlertadas: [...],
                totalEncontradas, erro? }
        },
        erro?
      }
    ]
  }
  ```
- Cada `<pub>` no DOU e DOESP tem: `{ tipo, titulo, resumo, link?, data?,
  orgaoStr?, orgaoCategoria? }`. Após a Etapa 1, `relevantes[]` e `novas[]` dos
  diários ganharão também `classificacao: { gravidade, prazo, acao, explicacao }`.
- As entradas individuais de `ibama.autos.novas[]` e `ibama.embargos.novas[]`
  são registros CSV/JSON do IBAMA (campos variados). **NÃO** chamar
  `classificarPublicacao()` sobre elas — em vez disso, o e-mail e o painel
  inferem gravidade pela **chave da fonte** (`autos` → alta, `embargos` → crítica).

### `alerta.js`
- `gerarHtml(relatorio)` — gera o corpo HTML do e-mail por cliente.
  Atualmente: lista plana de publicações sem distinção de gravidade.
  **Etapa 2 altera esta função.**
- `contarAlertas(relatorio)` — conta alertas novos (não alterar).
- `enviarAlerta(relatorio, opcoes)` — envia e-mail por cliente (não alterar
  a assinatura nem o disparo — apenas o HTML que `gerarHtml` produz).

### `painel.js`
- `statusSistema()` (linhas ~193-203) — retorna status do painel.
  **Etapa 3 adiciona** `alertasUrgentesHoje` e `totalEmpresasAtivas` ao retorno.
- Rotas existentes: GET/POST sobre `/api/relatorios`, `/api/empresas`,
  `/api/varredura`, `/api/autoteste`. Não alterar contratos.

### `public/app.js`
- `renderizarPublicacao(pub)` — monta o HTML de uma publicação individual.
  **Etapa 3 altera esta função** para exibir badge de gravidade, prazo e ação.
- `renderizarClienteRelatorio(c)` — monta o HTML por cliente.
  **Etapa 3 altera** para ordenar `relevantes` por gravidade antes de renderizar.
- `renderizarStatus(status)` — monta o bloco "Status do Sistema".
  **Etapa 3 altera** para exibir os cards de KPI.

---

# 🔑 Regras do Classificador

O classificador é uma função **pura e determinística**: mesma entrada, mesma
saída. Sem rede, sem estado, sem efeitos colaterais. As regras são avaliadas
**de cima para baixo — primeira que bater vence**.

## Shape de entrada (`pub`)
```js
{
  tipo:           string,  // ex.: "Portaria", "Auto de Infração", "Licença"
  titulo:         string,
  resumo:         string,
  link?:          string,
  data?:          string,
  orgaoStr?:      string,
  orgaoCategoria?: string   // ex.: "ICMBio"
}
```

## Shape de saída (`classificacao`)
```js
{
  gravidade:  "critica" | "alta" | "media" | "baixa",
  prazo:      string,   // frase legivel, ex.: "20 dias corridos para defesa"
  acao:       string,   // instrucao direta, ex.: "Apresentar defesa administrativa"
  explicacao: string    // frase completa em portugues sem acento
}
```

## Regras (em ordem de prioridade)

> A busca de palavras-chave e **case-insensitive** e ignora acentuacao.
> Crie funcoes auxiliares internas `contemPalavra(texto, palavra)` que
> normalizam para minusculas e removem acentos (substituicoes simples) antes de
> comparar. O campo buscado e sempre a concatenacao de `tipo + ' ' + titulo +
> ' ' + resumo`.

### Gravidade CRITICA
Qualquer uma das palavras: `embargo`, `embargada`, `embargado`, `interdicao`,
`interditada`, `interditado`, `suspensao de licenca`, `cassacao de licenca`.

```js
{
  gravidade:  "critica",
  prazo:      "Imediato — verifique urgentemente",
  acao:       "Contatar advogado ambiental imediatamente",
  explicacao: "Medida restritiva emitida pelo orgao ambiental. Pode implicar paralisacao de operacoes. Acao urgente necessaria."
}
```

### Gravidade ALTA — Auto de Infração
Qualquer uma das palavras: `auto de infracao`, `autuacao`, `infracao ambiental`.

```js
{
  gravidade:  "alta",
  prazo:      "20 dias corridos para apresentar defesa administrativa",
  acao:       "Apresentar defesa administrativa",
  explicacao: "Auto de infracao emitido pelo orgao ambiental. O prazo de defesa e de 20 dias corridos a partir da data de publicacao."
}
```

### Gravidade ALTA — Notificação
Contém `notificacao` E NÃO contém `licenca concedida`, `licenca aprovada`,
`licenca expedida`, `licenca emitida`.

```js
{
  gravidade:  "alta",
  prazo:      "Verificar prazo indicado na publicacao",
  acao:       "Responder a notificacao dentro do prazo estabelecido",
  explicacao: "Notificacao emitida pelo orgao ambiental. Verifique o prazo de resposta na publicacao original."
}
```

### Gravidade MEDIA — Renovação de Licença
Contém `renovacao` E (`licenca` OU `lo` OU `li` OU `lp`).

```js
{
  gravidade:  "media",
  prazo:      "Requerer renovacao com 120 dias de antecedencia do vencimento",
  acao:       "Verificar data de vencimento e requerer renovacao preventiva",
  explicacao: "Publicacao relacionada a renovacao de licenca. Verifique se o prazo de renovacao esta proximo para evitar operacao sem licenca."
}
```

### Gravidade MEDIA — Exigência ou Condicionante
Qualquer uma das palavras: `complementacao`, `exigencia`, `condicionante`.

```js
{
  gravidade:  "media",
  prazo:      "Verificar prazo indicado na publicacao",
  acao:       "Atender as exigencias ou condicionantes no prazo",
  explicacao: "Exigencia ou condicionante emitida pelo orgao ambiental. Requer acao dentro do prazo estabelecido."
}
```

### Gravidade MEDIA — Portaria / Resolução
O campo `tipo` (original, antes de normalizar) contém qualquer uma das palavras:
`Portaria`, `Resolucao`, `Resolução`, `Instrucao Normativa`, `Instrução`.

```js
{
  gravidade:  "media",
  prazo:      "Verificar aplicabilidade e prazo de adequacao",
  acao:       "Avaliar impacto da norma na operacao da empresa",
  explicacao: "Portaria ou resolucao publicada por orgao ambiental. Avalie se a norma afeta diretamente a operacao ou as licencas da empresa."
}
```

### Gravidade BAIXA — Licença Concedida
Qualquer uma das expressões: `licenca concedida`, `licenca aprovada`,
`licenca expedida`, `licenca emitida`, `concessao de licenca`.

```js
{
  gravidade:  "baixa",
  prazo:      "Nenhuma acao imediata",
  acao:       "Arquivar e atualizar registros de compliance",
  explicacao: "Licenca concedida pelo orgao ambiental. Verifique as condicionantes estabelecidas no ato e arquive o documento."
}
```

### Gravidade BAIXA — Fallback (qualquer outra publicacao)

```js
{
  gravidade:  "baixa",
  prazo:      "Verificar se requer acao",
  acao:       "Consultar a publicacao original",
  explicacao: "Publicacao relacionada ao monitoramento ambiental da empresa. Verifique o documento original para determinar se requer acao."
}
```

---

# 🧩 Related Code Context

| Para fazer... | Onde / como |
|---|---|
| Criar `classificarPublicacao(pub)` | Novo arquivo `classificador.js`. Exporta `{ classificarPublicacao }`. Função pura — sem require de outros módulos do projeto. |
| Integrar no DOU (relevantes[]) | `monitor.js` — após montar `relevantes` por empresa (busca DOU), mapear cada item adicionando `classificacao: classificarPublicacao(pub)`. |
| Integrar no DOESP (novas[]) | `monitor.js` — após montar `novas` do diário estadual, mapear cada item adicionando `classificacao: classificarPublicacao(pub)`. |
| IBAMA (autos/embargos) | NÃO chamar `classificarPublicacao`. O e-mail e o painel inferem gravidade pela chave: `autos` → alta, `embargos` → crítica. |
| Atualizar o e-mail | `alerta.js:gerarHtml(relatorio)` — reescrever o template HTML mantendo a assinatura. Usar CSS inline para compatibilidade com clientes de e-mail. |
| KPIs no painel (server-side) | `painel.js:statusSistema()` — adicionar `alertasUrgentesHoje` e `totalEmpresasAtivas` ao objeto retornado. Leia o último relatório já carregado ali. |
| KPIs no painel (frontend) | `public/app.js:renderizarStatus(status)` — usar os novos campos. |
| Badges de gravidade no painel | `public/app.js:renderizarPublicacao(pub)` — adicionar badge colorido + prazo + acao. |
| Ordenar por gravidade | `public/app.js:renderizarClienteRelatorio(c)` — ordenar `relevantes` por `classificacao.gravidade` antes de renderizar (critica primeiro). |
| CSS de gravidade | `public/style.css` — adicionar classes `.badge-critica`, `.badge-alta`, `.badge-media`, `.badge-baixa` e `.kpi-card`. |
| Retrocompatibilidade | Publicações sem `classificacao` (relatórios antigos) devem renderizar sem erro — checar `pub.classificacao` antes de usar. |

---

# ✅ Acceptance Criteria

> **Regra-mestra (R11):** após CADA etapa, `npm test` deve passar e um *smoke
> run* (`node monitor.js 16-05-2026` — sábado, sem rede, código 0) deve
> completar sem erro.

## Etapa 1 — Classificador de gravidade por regras

- [ ] **`classificador.js` exporta `classificarPublicacao(pub)`.**
  - Função pura: sem `require` de outros módulos do projeto, sem rede, sem
    estado. Pode usar apenas utilitários nativos do Node (não são necessários).
  - Segue as regras da seção "Regras do Classificador" acima, nesta ordem exata.
  - Retorna o shape `{ gravidade, prazo, acao, explicacao }` em todos os casos
    (nunca retorna `null` nem `undefined`).
  - Todos os campos do retorno são strings não-vazias.
  - Strings do retorno em **português sem acento** (conforme modelo nas regras).

- [ ] **Integração em `monitor.js` — publicações DOU.**
  Após filtrar `relevantes` por empresa, cada item recebe:
  ```js
  pub.classificacao = classificarPublicacao(pub);
  ```
  O campo `classificacao` viaja dentro de `resultado.relevantes[]` no relatório
  salvo em disco. Publicações em `jaAlertadas[]` e `todas[]` **não** precisam
  ser classificadas (são históricas — classificar `relevantes` é suficiente).

- [ ] **Integração em `monitor.js` — publicações DOESP.**
  Após montar `novas[]` do diário estadual SP, cada item recebe:
  ```js
  pub.classificacao = classificarPublicacao(pub);
  ```
  O campo viaja em `diariosEstaduais.SP.novas[]` no relatório.

- [ ] **`classificador.test.js` cobre os casos principais:**
  - Auto de infração → gravidade `"alta"`, `prazo` começa com `"20 dias"`.
  - Embargo → gravidade `"critica"`.
  - Renovação de licença → gravidade `"media"`.
  - Licença concedida → gravidade `"baixa"`.
  - Publicação sem palavras-chave → fallback, gravidade `"baixa"`.
  - Todos os campos do retorno são strings não-vazias em todos os casos.
  - Case-insensitive: "AUTO DE INFRAÇÃO", "Auto de infracao" → `"alta"`.

- [ ] **Retrocompatibilidade:** `monitor.js` continua produzindo relatório
  correto para fins de semana (saída 0 sem erro).

- [ ] **Nenhuma regressão:** `npm test` passa. `cron.js` e o painel continuam
  funcionando (`classificacao` é um campo additive — nada quebra se ele existir).

## Etapa 2 — E-mail rico e acionável

- [ ] **`alerta.js:gerarHtml(relatorio)` reescrito com novo template.**
  O e-mail deve ter, por cliente:

  **Seção "Atenção Imediata"** (aparece SOMENTE se houver publicações com
  `classificacao.gravidade === "critica"` ou `=== "alta"`, ou registros novos
  em `ibama.embargos.novas` ou `ibama.autos.novas`):
  - Fundo destacado (laranja escuro ou vermelho suave), texto "⚠️ Atenção
    Imediata — ação necessária".
  - Lista de publicações críticas/altas com: nome da empresa, badge de
    gravidade colorido, título, prazo e ação em destaque.
  - Para IBAMA: "IBAMA — Embargo" com gravidade crítica; "IBAMA — Auto de
    Infração" com gravidade alta. Mostrar contagem de registros novos.

  **Seção por empresa** (publicações médias e baixas, ou empresa sem urgentes):
  - Nome da empresa como subtítulo.
  - Cada publicação: badge de gravidade colorido + título + link "Abrir" +
    prazo em itálico + ação.

  **Rodapé:**
  - "X publicações novas · Y empresas verificadas · próxima varredura: amanhã
    às 8h (dias úteis)"
  - Contagem de urgentes se houver: "Sendo Z de atenção imediata."

  **CSS inline obrigatório** (clientes de e-mail não suportam CSS externo):
  - `critica`: `background: #fee2e2; color: #991b1b; border-left: 4px solid #dc2626`
  - `alta`: `background: #ffedd5; color: #9a3412; border-left: 4px solid #ea580c`
  - `media`: `background: #fef9c3; color: #854d0e`
  - `baixa`: `background: #dcfce7; color: #166534`

- [ ] **Retrocompatibilidade no e-mail.** Se uma publicação não tiver
  `classificacao` (relatório legado), o e-mail renderiza sem erro — omite os
  campos de gravidade/prazo/ação mas mostra título e link normalmente.

- [ ] **`alerta.test.js` ou `alerta.js` existente:** verificar se os testes
  existentes continuam passando. Se `gerarHtml` for coberta por testes, adaptar
  para o novo template (ou adicionar casos novos). Não remover cobertura.

- [ ] **Assinatura de `enviarAlerta` e `contarAlertas` inalterada.** Apenas o
  HTML interno muda.

## Etapa 3 — Dashboard visual com urgência

- [ ] **KPIs em `painel.js:statusSistema()`.**
  Adicionar ao objeto retornado:
  - `alertasUrgentesHoje` (int): contagem de publicações com
    `classificacao.gravidade === "critica"` ou `=== "alta"` em `relevantes[]`
    de todos os clientes do último relatório, MAIS contagem de
    `ibama.autos.novas` e `ibama.embargos.novas` (que são sempre urgentes).
    Se não houver último relatório, retornar `0`.
  - `totalEmpresasAtivas` (int): total de empresas com `"ativa": true` em todos
    os clientes com `"ativo": true` no `config.json` atual.
  Se o último relatório não tiver o campo `classificacao` (legado), contar
  apenas os registros IBAMA urgentes e retornar `0` para publicações DOU/DOESP.

- [ ] **Cards de KPI em `public/index.html` e `public/app.js`.**
  Três cards no topo da página, acima dos botões:
  - "Alertas urgentes hoje" → valor de `alertasUrgentesHoje` (vermelho se > 0,
    cinza/verde se 0).
  - "Empresas monitoradas" → valor de `totalEmpresasAtivas`.
  - "Última execução" → valor de `ultimaExecucao` (já existente no status).
  Os cards são renderizados por `renderizarStatus(status)` em `public/app.js`.

- [ ] **Badge de gravidade em `public/app.js:renderizarPublicacao(pub)`.**
  Se `pub.classificacao` existir:
  - Exibir badge colorido antes do título: `[CRÍTICA]`, `[ALTA]`, `[MÉDIA]`,
    `[BAIXA]` com cores correspondentes (mesmas do e-mail, em CSS class).
  - Exibir abaixo do título: prazo em itálico + ação em negrito.
  Se `pub.classificacao` não existir (relatório antigo), renderizar como hoje.

- [ ] **Ordenar publicações por gravidade** em
  `public/app.js:renderizarClienteRelatorio(c)`.
  Ordem: `critica` → `alta` → `media` → `baixa` → sem classificacao.
  Aplicar tanto a `relevantes` quanto a `jaAlertadas` quando renderizados.

- [ ] **CSS em `public/style.css`:**
  - Classes `.badge-critica`, `.badge-alta`, `.badge-media`, `.badge-baixa`
    com cores e padding adequados.
  - Classe `.kpi-grid` para o grid de 3 cards.
  - Classe `.kpi-card` com borda, padding, número em destaque.
  - Classe `.kpi-urgente` (vermelho/alarme) aplicada ao card de urgentes quando
    `alertasUrgentesHoje > 0`.
  - Ajuste responsivo básico: em telas < 600px, o `.kpi-grid` vira coluna única
    e o `.status-grid` existente também se adapta.

- [ ] **`painel.test.js` existente continua passando.** Se `statusSistema` for
  coberta, adaptar os testes para os novos campos (com valor `0` quando sem
  relatório).

## Geral (todas as etapas)

- [ ] Todo comentário de código novo/alterado em **português SEM acento**.
- [ ] Nenhuma regressão: pipeline DOU+IBAMA+diários, dedup, e-mail aos clientes,
  `cron.js`, painel, autoteste e saúde continuam funcionando.
- [ ] `README.md` atualizado ao fim de cada etapa com as novas funcionalidades.
- [ ] `.gitignore` cobre quaisquer novos artefatos de runtime (nenhum esperado).

---

# 🚫 Guardrails

**Escopo:**
- [ ] DO NOT adicionar chamadas a APIs externas de IA (OpenAI, Claude API,
  Groq, etc.) — o classificador é 100% baseado em regras locais, sem rede.
- [ ] DO NOT adicionar fontes novas de dados (novos estados, novas APIs) —
  isso é Fase 6.
- [ ] DO NOT adicionar rastreamento de prazos em banco de dados — isso é Fase 6.
- [ ] DO NOT adicionar portal do cliente (login por cliente) — o painel
  continua sendo exclusivo do operador.
- [ ] DO NOT adicionar WhatsApp ou outros canais de notificação.
- [ ] DO NOT transformar o frontend em SPA com framework (React, Vue, etc.) —
  HTML/CSS/JS vanilla.

**Qualidade de código:**
- [ ] DO NOT introduzir TypeScript, ESM ou build step.
- [ ] DO NOT adicionar dependências novas ao `package.json` — tudo é possível
  com o que já existe. Qualquer dependência nova exige justificativa explícita
  e consulta ao operador.
- [ ] DO NOT escrever comentários em inglês nem com acentuação.
- [ ] DO NOT reimplementar a normalização de acentos com bibliotecas externas —
  use substituições simples de string (`.replace(/[áàã]/g, 'a')` etc.).

**Arquitetura / Retrocompatibilidade (crítico):**
- [ ] NEVER quebrar o formato de relatório existente — `classificacao` é um
  campo **adicional** em cada publicação; relatórios antigos **sem** o campo
  devem continuar abrindo no painel e gerando e-mail sem erro.
- [ ] NEVER alterar o contrato público de `executarMonitor`, `enviarAlerta`,
  `contarAlertas`, `gerarHtml` — apenas o comportamento interno/HTML muda.
- [ ] NEVER apagar arquivos `relatorio-*.json`.
- [ ] DO NOT modificar `dou-scraper.js`, `dou-extrator.js` ou outros artefatos
  de debug legados.
- [ ] DO NOT alterar `config.json` — nenhum campo novo é necessário na Fase 5.

**Segurança:**
- [ ] NEVER commitar `config.local.json`.
- [ ] DO NOT expor dados de clientes ou relatórios sem checagem de sessão.

**Testes:**
- [ ] DO NOT escrever testes que fazem rede real — mocke todos os limites
  externos.
- [ ] DO NOT buscar cobertura artificial — teste a lógica nova não trivial
  (regras do classificador, KPIs de statusSistema).
- [ ] DO NOT asserir contagens exatas de resultados do DOU.

---

# ⚙️ Implementation Guidance

## Execução em camadas (etapa por etapa)

- **Layer 0 — Etapa 1 (Classificador):** código novo isolado (`classificador.js`
  + integração pontual em `monitor.js`). Fundação das Etapas 2 e 3.
  Validar com `npm test` e smoke run antes de avançar.

- **Layer 1 — Etapa 2 (E-mail):** altera apenas `alerta.js:gerarHtml`.
  A assinatura e o disparo não mudam. O HTML do e-mail é testável com mocks do
  relatório. Validar com `npm test` antes de avançar.

- **Layer 2 — Etapa 3 (Dashboard):** altera `painel.js`, `public/app.js`,
  `public/index.html` e `public/style.css`. Majoritariamente frontend — validar
  com `npm test` (que cobre painel.js) e inspeção visual do HTML gerado.

## Checkpoint obrigatório ao fim de cada etapa

1. `npm test` passa (todos verdes — base atual: 89 testes).
2. *Smoke run*: `node monitor.js 16-05-2026` (sábado) encerra com código 0 sem
   erro. Confirmar que o processo sai normalmente (não trava).
3. `README.md` atualizado.
4. Comentários do código novo em português sem acento.

## Restrições técnicas

- **Plataforma:** o claudiomiro roda no Linux/WSL. `npm test` roda normalmente
  ali — a suíte é toda mockada. **Não** rode scripts que abram o Chromium ou
  acessem os portais ao vivo.
- **E-mail HTML:** use CSS **inline** (atributo `style=""` em cada tag) — não
  use `<style>` no `<head>` do e-mail, pois clientes de e-mail como Gmail
  ignoram estilos no head. Tabelas para layout se necessário.
- **Normalização de acentos no classificador:** implemente uma função auxiliar
  interna simples:
  ```js
  function normalizar(str) {
    return String(str || '').toLowerCase()
      .replace(/[áàâãä]/g, 'a').replace(/[éèêë]/g, 'e')
      .replace(/[íìîï]/g, 'i').replace(/[óòôõö]/g, 'o')
      .replace(/[úùûü]/g, 'u').replace(/ç/g, 'c').replace(/ñ/g, 'n');
  }
  ```
  Use `normalizar(tipo + ' ' + titulo + ' ' + resumo)` para a busca de
  palavras-chave, mas preserve os textos originais no retorno (campos `prazo`,
  `acao`, `explicacao` já estão escritos sem acento nas regras).
- **Ordenação por gravidade:** mapeie para número:
  `{ critica: 0, alta: 1, media: 2, baixa: 3 }` e use `Array.sort()`.
  Publicações sem `classificacao` vão para o final (valor 4).

## Exemplo de saída esperada — `classificarPublicacao`

```js
// Entrada
const pub = {
  tipo: "Auto de Infração",
  titulo: "IBAMA autua empresa por desmatamento",
  resumo: "Auto de infracao ambiental n. 123456"
};

// Saida
classificarPublicacao(pub)
// {
//   gravidade:  "alta",
//   prazo:      "20 dias corridos para apresentar defesa administrativa",
//   acao:       "Apresentar defesa administrativa",
//   explicacao: "Auto de infracao emitido pelo orgao ambiental. O prazo de defesa e de 20 dias corridos a partir da data de publicacao."
// }
```

## Exemplo de badge no e-mail (CSS inline)

```html
<!-- Gravidade alta -->
<span style="display:inline-block;padding:2px 8px;border-radius:3px;
  font-size:11px;font-weight:bold;background:#ffedd5;color:#9a3412;">
  ALTA
</span>

<!-- Gravidade critica -->
<span style="display:inline-block;padding:2px 8px;border-radius:3px;
  font-size:11px;font-weight:bold;background:#fee2e2;color:#991b1b;">
  CRÍTICA
</span>
```
