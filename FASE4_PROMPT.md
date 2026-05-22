# 🎯 Purpose

---

**⚠️ STATUS DESTA SESSÃO — LEIA ISTO PRIMEIRO**

A Fase 4 tem **3 etapas**. A **Etapa 1 (auto-diagnóstico) JÁ FOI IMPLEMENTADA**:
os arquivos `saude.js` e `saude.test.js` já existem, e `monitor.js`, `alerta.js`,
`dou.js`, `config.json`, `painel.js`, `public/app.js` e `public/style.css` já
foram alterados para ela. A suíte de testes está verde — **76 testes passando**.

**Seu trabalho nesta sessão, nesta ordem:**

1. **VERIFICAR a Etapa 1.** Confira a implementação que já existe contra os
   critérios de aceite da seção **"Etapa 1 — Auto-diagnóstico e aviso de falha"**
   mais abaixo. Trate aquela seção como um **checklist de verificação**, não como
   trabalho novo. Corrija apenas lacunas reais; **não reescreva** o que já está
   pronto e funcionando. Inclua aqui a atualização do `README.md` para a Etapa 1,
   caso ela ainda não tenha sido feita.
2. **IMPLEMENTAR a Etapa 2** — Execução autônoma no Windows.
3. **IMPLEMENTAR a Etapa 3** — Autoteste de fontes.

**Como validar nesta sessão (o claudiomiro está rodando no WSL/Ubuntu):**

- A validação de cada etapa é: **(a)** `npm test` 100% verde; e **(b)**
  `node monitor.js 16-05-2026` (um sábado) encerrando com **código de saída 0**.
  Em fim de semana o monitor sai cedo, sem abrir o navegador nem acessar a rede —
  isso exercita o caminho de saída do processo sem depender dos portais.
- **NÃO** instale o navegador do Playwright e **NÃO** rode *smoke runs* que abram
  o Chromium ou acessem DOU/IBAMA/DOESP ao vivo. Onde este documento pedir um
  *smoke run* com `node monitor.js 15-05-2026` (dia útil), **substitua** pela
  validação (a)+(b) acima.
- A validação **ao vivo** — `npm run autoteste` real, execução real contra os
  portais, o arquivo `.bat` e a pasta de Inicialização do Windows — é feita
  **depois, pelo operador, no Windows**, e **não** faz parte desta sessão. Crie o
  `.bat` e confira o conteúdo, mas não o execute.
- Todo o resto deste documento — Tech Stack, contexto de código, critérios de
  aceite das Etapas 2 e 3, Guardrails e Reasoning Boundaries — **continua valendo
  integralmente**.

**Por que esta fase importa para o negócio:** confiabilidade é a **trava nº 1**
do plano de negócio (`PLANO-DE-NEGOCIO.md`, seções 9, 11 e 14): um serviço pago
precisa saber e avisar quando ele mesmo falha. Enquanto a Fase 4 não estiver
concluída, não dá para cobrar de um cliente. Por isso ela é a próxima fase — e a
única desta sessão.

---

**O quê:** Implementar a **Fase 4 do Monitor de Licenciamento Ambiental** em
**3 etapas sequenciais** — (1) auto-diagnóstico e aviso de falha, (2) execução
autônoma no Windows, (3) autoteste de fontes — sem quebrar nenhuma
funcionalidade das Fases 2 e 3.

**Por que importa:** O sistema hoje coleta DOU + IBAMA + diários estaduais para
vários clientes e tem um painel web. Mas ele tem duas fraquezas que impedem o
uso confiável: (a) quando uma fonte falha, a falha fica escondida dentro do JSON
do relatório — ninguém é avisado, e um relatório "nada encontrado" pode na
verdade ser "não consegui verificar"; (b) ele só roda quando alguém deixa o
`cron.js` aberto num terminal ou clica "Iniciar Varredura" no painel. A Fase 4
torna o monitor **confiável** (ele sabe e avisa quando ele mesmo falha) e
**autônomo** (roda sozinho quando o PC é ligado, sem ninguém abrir nada).

**Definição de sucesso:** As 3 etapas concluídas e validadas, cada uma com
testes automatizados e um *smoke run* antes da próxima. Ao final: `npm test`
passa; `node monitor.js` continua rodando o pipeline e agora retorna um código
de saída correto; uma falha de fonte gera um e-mail de aviso ao operador; existe
um script `.bat` que roda o monitor ao ligar o Windows; existe um comando de
autoteste das fontes. **Nada das Fases 2 e 3 pode regredir.**

---

# 📁 Environment & Codebase Context

> **Esta é a seção mais importante. Leia-a inteira antes de escrever qualquer
> linha de código. O código já passou pelas Fases 2 e 3 — muita coisa já existe.
> NÃO reescreva o que já está pronto; apenas estenda.**

## Tech Stack
- **Runtime:** Node.js v24 (assuma **Node 20+** como mínimo).
- **Linguagem:** JavaScript puro, **CommonJS** (`require`/`module.exports`,
  `"type": "commonjs"`). **Sem TypeScript, sem ESM, sem build step.**
- **Scraping:** Playwright 1.60 (Chromium headless).
- **Banco:** `better-sqlite3` 12 (arquivo `dedup.db`).
- **Web:** `express` 5 + `express-session` (painel).
- **Outras libs:** `csv-parse` 6, `adm-zip`, `node-cron` 4, `resend` 6 (e-mail).
- **Plataforma alvo:** **Windows 10.** O claudiomiro roda no WSL/Ubuntu, mas o
  projeto vive em `/mnt/d/Claude/monitor de licenciamento` (= `D:\Claude\monitor
  de licenciamento` no Windows) e o **operador final usa Windows**. O script de
  agendamento da Etapa 2 é um `.bat` do Windows.

## Estrutura do Projeto (raiz: `D:\Claude\monitor de licenciamento`)
```
monitor.js          Pipeline principal — orquestra clientes + DOU + IBAMA + diarios + dedup + alerta
dou.js              Busca no DOU (Playwright): buscarDOU()
ibama.js            Fontes de dados abertos IBAMA: buscarFonte(), FONTES
diario-estadual.js  Registry de diarios estaduais por UF: DIARIOS, buscarDOESP()
icmbio.js           Categoriza publicacoes do DOU emitidas pelo ICMBio
dedup.js            Deduplicacao em SQLite, isolada por cliente_id
alerta.js           E-mail HTML via Resend: enviarAlerta(), gerarHtml(), contarAlertas()
config-loader.js    Le e mescla config.json + config.local.json (retrocompativel)
retry.js            Helper de retentativa com backoff: comRetentativa()
log.js              Espelha console.* para logs/YYYY-MM-DD.log
cron.js             Agendador node-cron (precisa do terminal aberto)
painel.js           Servidor web Express do painel de operador
public/             Frontend do painel (HTML/CSS/JS vanilla)
config.json         Configuracao (versionada, sem segredos)
config.local.json   Segredos — resendApiKey, painel.senha (FORA do git)
package.json        Dependencias; scripts: "test", "painel"
*.test.js           Suite de testes (node:test) — 69 testes passando hoje
```

## Padrão de Arquitetura
Monolito de **módulos planos** em CommonJS. Sem camadas/MVC. Cada módulo exporta
funções nomeadas. Ponto de entrada: `monitor.js`, chamado por `node monitor.js
[data]`, por `cron.js`, ou pelo painel.

## Estado Atual Relevante (pós-Fase 3 — confirmado por leitura do código)

### `monitor.js`
- **`executarMonitor(opcoes = {})`** (linha ~163) — entrada pública; envolve a
  execução com o ciclo de log (`logger.iniciar()` / `logger.fechar()`).
- **`executarMonitorInterno(opcoes, arquivoLog)`** (linha ~363) — o orquestrador
  real. `opcoes.config` (padrão `carregarConfig()`), `opcoes.data` (padrão hoje).
  Retorna `null` em fim de semana, ou o objeto `relatorio` no sucesso.
- **Laço multi-cliente** (linhas ~392-447): `for (const cliente of
  clientesAtivos)`, com **try/catch por cliente** — um cliente que falha não
  derruba os outros; o erro vai para `relatorio.clientes[n].erro`.
- **Erros já são capturados por fonte** (NÃO reimplemente isto — apenas leia):
  - DOU, por empresa: `resultado.erro` (string) — linhas ~199-207.
  - IBAMA, por fonte: `ibamaPorFonte[fonteKey].erro` — linhas ~284-286.
  - Diário estadual, por UF: `diariosPorUF[uf].erro` — linhas ~348-356.
  - Cliente inteiro: `relatorio.clientes[n].erro` — linhas ~437-445.
- **Shape do relatório** (montado nas linhas ~382-447, salvo nas ~452-459):
  ```
  {
    data: "DD-MM-YYYY",
    executadoEm: "<ISO 8601>",
    clientes: [
      {
        clienteId, clienteNome,
        resultados: [ { empresa, cnpj, totalEncontradas, relevantes[],
                        jaAlertadas[], todas[], erro? } ],
        ibama: { "<fonteKey>": { novas[], jaAlertadas[], totalEncontradas, erro? } },
        diariosEstaduais: { "<UF>": { fonte, nome, novas[], jaAlertadas[],
                                      totalEncontradas, erro? } },
        erro?
      }
    ]
  }
  ```
- Salvo como `relatorio-YYYY-MM-DD.json` via `fs.writeFileSync`.
- **Bloco CLI** (linhas ~530-533): `if (require.main === module) { ...
  executarMonitor(...).catch(console.error); }`. **Não há `process.exit()`** —
  hoje, mesmo uma falha fatal sai com código 0. Isto é um problema para a
  Etapa 2.
- **Não existe** nenhum resumo agregado de saúde. Os campos `erro` ficam
  espalhados; só o painel os conta (`contarErrosRelatorio`).

### `alerta.js`
- `contarAlertas(relatorio)` — soma alertas novos por fonte.
- `gerarHtml(relatorio)` — corpo HTML do e-mail.
- `enviarAlerta(relatorio, opcoes)` — `opcoes = { apiKey, de, para }`. Envia
  **um e-mail por cliente**, **somente se houver alertas novos** (`total > 0`).
  Assunto: `[Monitor Ambiental] ...`. Retorna `false` em falha de envio.

### `log.js`
- `iniciar()` / `fechar()` — monkey-patch de `console.*`; grava em
  `logs/YYYY-MM-DD.log` (um arquivo por dia, modo append). Exporta `LOG_DIR`.
- **NÃO há rotação nem limpeza** — os arquivos de log se acumulam para sempre.

### `cron.js`
- `node-cron`, agenda lida de `config.json` (`agendamento.cron`, padrão
  `0 8 * * 1-5`). Chama `executarMonitor()`. **Precisa do terminal aberto** — o
  processo tem que ficar vivo. A Etapa 2 NÃO substitui o `cron.js`; ela adiciona
  um caminho alternativo (Agendador do Windows). `cron.js` deve continuar
  funcionando.

### `painel.js`
- `statusSistema()` (linhas ~193-203) — retorna `{ totalRelatorios,
  ultimoRelatorio, ultimaExecucao, errosUltimoRelatorio, varredura: {...} }`.
- `contarErrosRelatorio(rel)` (linhas ~127-143) — conta os campos `erro`.
- Rotas: `GET /api/relatorios`, `GET /api/relatorios/:nome`,
  `GET/POST /api/empresas`, `POST /api/varredura`, `GET /api/varredura/status`.
- Frontend em `public/` (vanilla). A tela inicial mostra "Status do Sistema".

### Fontes (para a Etapa 3)
- `dou.js` → `buscarDOU(browser, termo, opcoes)` — **lança exceção** se a 1ª
  página falhar após as retentativas; em páginas seguintes, **emite aviso e
  continua** (perda silenciosa de páginas — ver Etapa 1, critério "DOU parcial").
- `ibama.js` → `buscarFonte(fonteKey, cnpjs, opcoes)` — lança exceção em erro
  HTTP/timeout. `FONTES` tem `autos` e `embargos`, cada um com uma `url`.
- `diario-estadual.js` → `DIARIOS.SP.buscar(browser, termo, opcoes)` e
  `buscarDOESP(termo, opcoes)` — lança exceção em erro HTTP/JSON/timeout.
- `retry.js` → `comRetentativa(fn, opcoes)` — backoff exponencial.

## ⚠️ Comportamento conhecido do portal DOU
A busca pelo **mesmo termo/data** pode retornar **contagens diferentes** entre
execuções. Consequências para a Fase 4:
- O **autoteste (Etapa 3) NÃO pode asserir contagem** — "a fonte respondeu sem
  erro" é o critério de PASS, não "a fonte devolveu N itens".
- Testes automatizados não asserem contagens do DOU — use fixtures/mocks.

---

# 🧩 Related Code Context

| Para fazer... | Use como referência / ponto de extensão |
|---------------|------------------------------------------|
| Agregar o resumo de saúde (`saude`) | Os campos `erro` já existentes no relatório (`monitor.js` ~199-207, ~284-286, ~348-356, ~437-445). Apenas **leia e some** — não reimplemente captura de erro. |
| Montar o objeto `saude` | Ponto de montagem do relatório em `monitor.js:executarMonitorInterno` (~382-447), antes do `writeFileSync` (~452). |
| E-mail de aviso ao operador | `alerta.js:enviarAlerta` (~148-193) e `gerarHtml` (~23-144) são o modelo — crie uma função nova, ex.: `enviarAlertaDeFalha(saude, opcoes)`. Reuse o cliente Resend e o campo `de`. |
| Código de saída do processo | Bloco CLI de `monitor.js` (~530-533) e `executarMonitor` (~163-174). |
| Detectar perda de páginas no DOU | `dou.js:buscarDOU` — o ponto onde páginas seguintes falham e ele "avisa e continua" (~181-192). |
| Limpeza de logs antigos | `log.js` — modele em `iniciar()` (~46-85); exporte/chame uma função nova `limparLogsAntigos(dias)`. Use `LOG_DIR`. |
| Mostrar saúde no painel | `painel.js:statusSistema` (~193-203) e `contarErrosRelatorio` (~127-143); frontend em `public/` (tela "Status do Sistema"). |
| Autoteste das fontes | Reuse `buscarDOU` (`maxPaginas: 1`), uma checagem HTTP leve para a `url` de `ibama.js:FONTES`, e `buscarDOESP` com janela de 1 dia. Modele a estrutura de "módulo executável separado" no `cron.js`. |
| Merge de config | `config-loader.js` — já mescla `config.json` + `config.local.json`; campos novos em `config.json` passam direto. |

**Arquivos que NÃO devem ser modificados:** artefatos de debug legados
(`dou-scraper.js`, `dou-extrator.js`, `teste-http.js`, `dou-*.html/json/png`).

---

# ✅ Acceptance Criteria

> **Regra-mestra (R11):** após CADA etapa, `npm test` deve passar e um *smoke
> run* (`node monitor.js 15-05-2026`) deve produzir relatório sem regressão.

## Etapa 1 — Auto-diagnóstico e aviso de falha

- [ ] **Resumo de saúde no relatório.** O objeto `relatorio` ganha um campo
  `saude` no topo, com este shape exato:
  ```
  saude: {
    status: "ok" | "parcial",
    fontes: {
      dou:     { ok: <int>, parcial: <int>, falha: <int> },
      ibama:   { ok: <int>, falha: <int> },
      diarios: { ok: <int>, falha: <int> }
    },
    falhas: [ "<descricao legivel de cada falha>", ... ]
  }
  ```
  - As contagens são **somadas sobre todos os clientes**. `dou.ok` = buscas de
    empresa que terminaram sem `erro` e sem perda de página; `dou.falha` = buscas
    com `erro`; `ibama`/`diarios` contam por fonte/UF.
  - `status` = `"ok"` se não houver nenhuma falha nem parcial; senão `"parcial"`.
  - `falhas[]` = lista de strings legíveis em português, ex.:
    `"DOU - empresa CETESB (cliente Cliente Padrao): timeout"`,
    `"IBAMA autos: HTTP 503"`.
  - O `saude` é montado a partir dos campos `erro` **que já existem** no
    relatório — não reimplemente a captura de erro.
- [ ] **DOU parcial.** Quando `buscarDOU` perde páginas seguintes (hoje só emite
  aviso e continua), isso passa a ser sinalizado: `buscarDOU` retorna um campo
  novo opcional `parcial: true` (e `aviso: "<texto>"`); `monitor.js` o propaga
  para `resultado.parcial`; o `saude` o conta em `dou.parcial`. Adicionar campo
  ao retorno **não** quebra chamadores existentes.
- [ ] **E-mail de aviso ao operador.** Nova função em `alerta.js` (ex.:
  `enviarAlertaDeFalha(saude, opcoes)`). Após a execução, se `saude.status !==
  "ok"`, envia **um** e-mail ao operador listando as `falhas[]`. Assunto começa
  com um marcador claro, ex.: `⚠️ [Monitor Ambiental] Execucao com problemas -
  DD-MM-YYYY`. É **separado** do `enviarAlerta` normal (que vai aos clientes).
- [ ] **Destinatário do operador via config.** `config.json` ganha o campo
  `alerta.operador` (array de e-mails) — quem recebe os avisos de falha. NÃO é
  segredo (vai no `config.json`, não no `config.local.json`). Se `alerta.operador`
  estiver vazio/ausente, o aviso é **pulado com um aviso no console** (mesmo
  padrão de `enviarAlerta` quando não há `para`).
- [ ] **Falha fatal também avisa.** Se `executarMonitor` lançar uma exceção
  antes de produzir o relatório (ex.: navegador não abre, config inválida),
  `executarMonitor` captura, **tenta** enviar um e-mail de aviso ao operador
  (`⚠️ [Monitor Ambiental] O monitor nao rodou - DD-MM-YYYY`, com a mensagem do
  erro) e **relança** a exceção (para a Etapa 2 poder sair com código 1). O
  envio do e-mail é *best-effort* — se a própria falha for falta de internet, o
  e-mail não sai, e tudo bem (o problema fica no log).
- [ ] **Painel mostra a saúde.** `statusSistema()` e a tela "Status do Sistema"
  passam a exibir a saúde da última execução: o `status` geral (`ok`/`parcial`)
  e a quebra por fonte. Para relatórios **legados sem o campo `saude`**, o painel
  cai graciosamente no comportamento atual (`errosUltimoRelatorio`) — um
  relatório antigo nunca pode derrubar a tela.
- [ ] **Testes:** o cálculo do `saude` (uma função pura, testável, recebendo um
  `relatorio` e devolvendo `saude`) é coberto por testes `node:test` — caso sem
  falhas, caso com falha de fonte, caso com DOU parcial.

## Etapa 2 — Execução autônoma no Windows

- [ ] **Código de saída correto.** `node monitor.js [data]` passa a encerrar com
  `process.exit(0)` quando a execução completa (mesmo com falhas de fonte — elas
  já são tratadas e avisadas pela Etapa 1) e `process.exit(1)` quando há falha
  fatal (a execução não completou). Fim de semana = saída 0. Isto permite o
  Agendador do Windows saber se o monitor rodou.
- [ ] **Script `.bat` para execução automática.** Criar `executar-monitor.bat`
  na raiz do projeto: entra na pasta do projeto (`cd /d`), executa
  `node monitor.js`, e encerra propagando o código de saída. O `.bat` roda toda
  vez que o PC é ligado (pasta de Inicialização do Windows), então precisa de
  uma **guarda de "uma vez por dia"**: se o relatório do dia já existe (o
  monitor já rodou hoje), o `.bat` apenas registra isso e sai com código 0, sem
  rodar de novo. Obtenha a data de hoje via `node -e` para não depender do
  formato regional de `%date%`. O `.bat` é simples e robusto (funciona sem
  terminal interativo).
- [ ] **Seção no README.** O `README.md` ganha uma seção **"Execução automática
  no Windows"** descrevendo a abordagem de **executar ao ligar o computador**:
  o passo a passo para colocar um atalho de `executar-monitor.bat` na pasta de
  Inicialização do Windows (`Win+R` -> `shell:startup`), de modo que o monitor
  rode sozinho toda vez que o PC for ligado. A seção explica a guarda de "uma
  vez por dia" e cita o Agendador de Tarefas apenas como alternativa para quem
  mantém o PC ligado em horário fixo.
- [ ] **Retenção de logs.** Nova função em `log.js`, ex.:
  `limparLogsAntigos(diasReter)`, que apaga arquivos `logs/*.log` mais antigos
  que `diasReter` dias. Chamada uma vez por execução (ex.: dentro de
  `executarMonitor`). O número de dias vem de `config.json`, ex.:
  `manutencao: { logsDiasReter: 30 }`, com padrão 30 se ausente.
- [ ] Os arquivos `relatorio-*.json` **NÃO** são apagados — são o histórico do
  produto e o painel depende deles. A limpeza é só de logs.
- [ ] **NÃO** automatizar a instalação do atalho de inicialização (nada de
  `schtasks` nem cópia automática para `shell:startup` pelo código). Colocar o
  atalho na pasta de Inicialização é um passo manual do operador, documentado
  no README.
- [ ] **Testes:** `limparLogsAntigos` é coberta por testes (apaga arquivo
  antigo, preserva arquivo recente) usando um diretório temporário — sem tocar
  no `logs/` real.

## Etapa 3 — Autoteste de fontes

- [ ] **Comando de autoteste.** Novo módulo executável `autoteste.js` + script
  `package.json` `"autoteste": "node autoteste.js"`. Ao rodar `npm run
  autoteste`, ele checa a **conectividade e resposta** de cada fonte e imprime um
  resultado claro por fonte: `DOU: OK`, `IBAMA: OK`, `DOESP: FALHOU - <motivo>`.
- [ ] **Probes leves e rápidos.** O autoteste:
  - **DOU:** abre o Chromium, faz uma busca mínima (`maxPaginas: 1`, termo
    genérico, janela de poucos dias). PASS = respondeu sem lançar exceção
    (qualquer contagem, inclusive zero). Fecha o navegador.
  - **IBAMA:** checagem HTTP leve (HEAD ou GET condicional) à `url` de
    `FONTES.autos` — **não** baixa o zip inteiro. PASS = a URL respondeu
    2xx/3xx.
  - **DOESP:** chama `buscarDOESP` com janela de ~1 dia. PASS = resposta JSON
    válida sem exceção.
  - **Resend:** checa apenas se a `resendApiKey` está configurada — **não**
    envia e-mail.
- [ ] **Sem efeitos colaterais.** O autoteste **não** envia e-mail, **não**
  grava no `dedup.db`, **não** gera arquivo `relatorio-*.json`. Alvo de tempo:
  rápido (ordem de ~1 minuto, dominado pela abertura do navegador).
- [ ] **Código de saída do autoteste:** 0 se todas as fontes passaram,
  diferente de 0 se alguma falhou.
- [ ] **Botão no painel.** O painel ganha uma forma de disparar o autoteste
  (ex.: rota `POST /api/autoteste` + botão "Testar fontes" na tela inicial) e
  mostra o resultado por fonte. Não pode travar o painel — rode de forma
  assíncrona ou com um estado de carregando claro, no mesmo espírito da
  "varredura manual".
- [ ] **Testes:** a função que monta o resultado do autoteste (PASS/FALHOU por
  fonte, a partir de probes mockados) é coberta por testes `node:test` — todas
  passam, uma falha.

## Geral (todas as etapas)
- [ ] Todo comentário de código novo/alterado em **português SEM acento**.
- [ ] Nenhuma regressão: pipeline DOU+IBAMA+diários, dedup, e-mail aos clientes,
  `cron.js` e o painel continuam funcionando.
- [ ] `README.md` atualizado ao fim de cada etapa.
- [ ] `.gitignore` cobre quaisquer novos artefatos de runtime.

---

# 🚫 Guardrails

**Escopo:**
- [ ] DO NOT adicionar fontes novas de dados nesta fase (sem novos estados, sem
  ICMBio geoespacial) — isso é Fase 5.
- [ ] DO NOT mexer no domínio de envio de e-mail nem em verificação de domínio
  no Resend — fora do escopo desta fase.
- [ ] DO NOT transformar o painel em multiusuário nem adicionar gráficos/relatórios
  avançados — só o necessário para a saúde e o botão de autoteste.
- [ ] DO NOT registrar a tarefa do Agendador do Windows via código.

**Qualidade de código:**
- [ ] DO NOT introduzir TypeScript, ESM ou build step — JS puro CommonJS.
- [ ] DO NOT adicionar dependências novas — tudo é possível com o que já existe
  (`node:test`, `https`/`fetch` nativo, `fs`). Qualquer dependência nova exige
  justificativa explícita.
- [ ] DO NOT escrever comentários em inglês nem com acentuação.
- [ ] DO NOT reimplementar a captura de erro por fonte — ela já existe; a
  Etapa 1 só **agrega** o que já está lá.

**Arquitetura / Retrocompatibilidade (crítico):**
- [ ] NEVER quebrar o formato de relatório existente — `saude` é um campo
  **adicional**; relatórios antigos **sem** `saude` devem continuar abrindo no
  painel.
- [ ] NEVER quebrar o formato legado de `config.json` — `alerta.operador` e
  `manutencao.logsDiasReter` são **opcionais**, com fallback sensato quando
  ausentes.
- [ ] DO NOT alterar o contrato público de `executarMonitor`, `buscarDOU`,
  `buscarFonte` de forma que quebre `cron.js` ou o painel — apenas **adicionar**
  campos/comportamentos.
- [ ] NEVER apagar arquivos `relatorio-*.json`.
- [ ] DO NOT modificar os artefatos de debug legados.

**Segurança:**
- [ ] NEVER commitar `config.local.json` (tem a chave Resend real e a senha do
  painel). NEVER colocar segredos em `config.json` ou no código.
- [ ] DO NOT expor a rota de autoteste do painel sem checagem de sessão (igual
  às outras rotas `/api/*`).

**Testes:**
- [ ] DO NOT escrever testes que fazem rede real (DOU, IBAMA, DOESP, Resend) —
  mocke todos os limites externos.
- [ ] DO NOT asserir contagens exatas de resultados do DOU.
- [ ] DO NOT buscar cobertura artificial — teste a lógica nova não trivial
  (cálculo do `saude`, `limparLogsAntigos`, montagem do resultado do autoteste).

---

# ⚙️ Implementation Guidance

## Execução em camadas (etapa por etapa)
- **Layer 0 — Etapa 1 (Auto-diagnóstico):** muda o shape do relatório (campo
  `saude`) e o `monitor.js`/`alerta.js`. Fundação das outras etapas.
- **Layer 1 — Etapa 2 (Execução autônoma):** códigos de saída, `.bat`, limpeza
  de logs. Toca o bloco CLI do `monitor.js` — coordene com o tratamento de falha
  fatal que a Etapa 1 instala.
- **Layer 2 — Etapa 3 (Autoteste):** majoritariamente código novo (`autoteste.js`
  + rota/painel). Vem por último.

## Checkpoint obrigatório ao fim de cada etapa
1. `npm test` passa (todos verdes).
2. *Smoke run*: `node monitor.js 15-05-2026` produz relatório sem erro e sem
   regressão; confira que o `saude` aparece e que o e-mail aos clientes ainda
   funciona como antes.
3. README atualizado.
4. Comentários do código novo em português sem acento.

## Restrições técnicas
- **Plataforma:** o claudiomiro roda no Linux/WSL. Rode `npm test` ali
  normalmente — a suíte é toda mockada e não acessa a rede. **Não** rode *smoke
  runs* que abram o navegador nem acessem os portais ao vivo; a forma de validar
  nesta sessão está descrita na seção **"STATUS DESTA SESSÃO"**, no topo deste
  documento. O `.bat` é um arquivo de texto para Windows — crie-o e confira o
  conteúdo, mas **não tente executá-lo** no Linux nem testar o Agendador (isso é
  validado depois, no Windows, pelo operador).
- **E-mail de aviso ao operador:** como o operador hoje é o próprio dono da
  conta Resend, esse e-mail entrega normalmente mesmo com o remetente de teste
  atual — não há bloqueio aqui.
- **Não otimize prematuramente.** O foco é confiabilidade, não performance.

## Testing Guidance
- **Runner:** `node:test` + `node:assert` nativos (já é o padrão do projeto).
- **Onde testar (lógica não trivial):**
  - Cálculo do `saude`: função pura `relatorio -> saude`; happy path, 1+ falhas
    de fonte, DOU parcial.
  - `limparLogsAntigos`: em diretório temporário — apaga antigo, mantém recente.
  - Montagem do resultado do autoteste: a partir de probes mockados (sem rede).
- **Mocke todos os limites externos:** Playwright, `https`/rede, Resend, `fs`
  quando fizer sentido, e o relógio quando o teste depender de datas.
- **Não testar:** glue code, configuração, libs externas, código não alterado.

---

# 🔍 Verification and Traceability

Antes de declarar a Fase 4 concluída, confirme que **cada requisito** tem
implementação correspondente.

| Req | Descrição | Onde foi atendido (preencher) |
|-----|-----------|-------------------------------|
| R1 | Campo `saude` no relatório (status geral + por fonte + lista de falhas) | |
| R2 | Detecção de DOU parcial (perda de páginas sinalizada) | |
| R3 | E-mail de aviso ao operador quando `saude.status !== "ok"` | |
| R4 | Falha fatal captura, tenta avisar o operador e relança a exceção | |
| R5 | Painel exibe a saúde da última execução; tolera relatório legado | |
| R6 | `node monitor.js` retorna código de saída correto (0 ok / 1 fatal) | |
| R7 | `executar-monitor.bat` + seção no README sobre execução ao ligar o PC | |
| R8 | Retenção/limpeza automática de logs antigos (configurável) | |
| R9 | `autoteste.js` + `npm run autoteste` + botão no painel | |
| R10 | Testes `node:test` da lógica nova; comentários PT sem acento | |
| R11 | Sem regressão (relatório legado, config legada, dedup, cron, painel) | |

**Checklist de auto-verificação final:**
- [ ] `npm test` passa do zero.
- [ ] `node monitor.js <data>` roda, gera relatório COM o campo `saude`, e sai
  com código 0.
- [ ] Forçando uma falha de fonte (mock/cenário), o `saude.status` vira
  `"parcial"` e um e-mail de aviso ao operador é disparado.
- [ ] Relatório legado da Fase 2/3 (sem `saude`) ainda abre no painel.
- [ ] `node cron.js` inicia sem erro; o e-mail aos clientes não regrediu.
- [ ] `npm run autoteste` roda, reporta cada fonte e sai com código coerente.
- [ ] `executar-monitor.bat` existe e tem conteúdo correto; README documenta a
  execução automática ao ligar o PC (pasta de Inicialização do Windows).

---

# 🧠 Reasoning Boundaries

- **Coerência do sistema acima de tudo:** preserve os padrões existentes
  (módulos planos CommonJS, registry de fontes, merge de config, monkey-patch de
  log). Não introduza paradigmas novos.
- **Estenda, não reescreva:** o código já passou por 2 fases e tem 69 testes. A
  Fase 4 **adiciona** um campo, uma função de e-mail, um `.bat`, uma limpeza de
  log e um autoteste. Se você se pegar reescrevendo `monitor.js` inteiro ou
  refazendo a captura de erro, pare — não é isso.
- **Retrocompatibilidade é inegociável:** todo relatório e todo `config.json`
  antigo tem que continuar funcionando. `saude`, `alerta.operador` e
  `manutencao.logsDiasReter` são todos opcionais com fallback.
- **Sem invenção:** se algum probe do autoteste se revelar inviável como
  descrito, **degrade graciosamente** (reporte a fonte como "não verificável"
  com o motivo) e **documente** — nunca invente um endpoint ou um resultado.
- **Em dúvida sobre algo crítico, pergunte** em vez de assumir.
