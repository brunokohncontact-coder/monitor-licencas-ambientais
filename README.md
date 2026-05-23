# Monitor de Licenciamento Ambiental

Ferramenta que vasculha automaticamente publicacoes oficiais atras de
mencoes a empresas monitoradas e avisa por e-mail quando encontra algo
relevante (licencas, autuacoes, embargos, portarias).

## O que o sistema faz

O monitor atende **multiplos clientes**: cada cliente tem sua propria lista
de empresas e seus proprios destinatarios de e-mail. Todo dia util, para
cada cliente ativo e cada empresa desse cliente, o monitor:

1. **Busca no DOU** (Diario Oficial da Uniao) pelo CNPJ da empresa e filtra
   as publicacoes relevantes para a area ambiental.
2. **Consulta os dados abertos do IBAMA** — autos de infracao e termos de
   embargo — cruzando pelo CNPJ.
3. **Consulta os diarios oficiais estaduais** das UFs das empresas
   monitoradas — hoje, o Diario Oficial do Estado de Sao Paulo (DOESP) —
   buscando pelo CNPJ.
4. **Deduplica** os resultados por cliente: o que ja foi avisado antes nao e
   avisado de novo (controle em banco SQLite, isolado por `cliente_id`).
5. **Envia um e-mail por cliente**, contendo apenas os achados daquele
   cliente, para os destinatarios daquele cliente (via servico Resend).
6. **Salva um relatorio** do dia em arquivo `relatorio-AAAA-MM-DD.json`,
   com um bloco por cliente.

Uma falha ao processar um cliente nao interrompe os demais: o erro fica
registrado no bloco daquele cliente e o monitor segue para o proximo.

## Requisitos

- **Node.js 20 ou superior** (recomendado: a versao instalada nesta maquina).
- Conexao com a internet.
- Uma conta no **[Resend](https://resend.com)** para o envio dos e-mails
  (a chave de API e gratuita para volume baixo).

## Instalacao

Dentro da pasta do projeto, rode:

```
npm install
npx playwright install chromium
```

- `npm install` baixa as bibliotecas que o projeto usa.
- `npx playwright install chromium` baixa o navegador que faz a leitura do
  portal do DOU.

## Configuracao

A configuracao fica em **dois arquivos**:

### `config.json` (vai para o git — sem segredos)

- `clientes` — lista de clientes monitorados. Cada cliente tem:
  - `id` — identificador unico (usado para isolar a deduplicacao).
  - `nome` — nome exibido nos relatorios e e-mails.
  - `ativo` — `false` pausa o cliente sem apagar a configuracao.
  - `empresas` — lista de empresas do cliente, cada uma com `nome`, `cnpj` e
    `ativa` (use `false` para pausar uma empresa).
  - `alerta.para` — destinatarios de e-mail **daquele** cliente.
- `filtro` — tipos de publicacao e palavras-chave que definem o que e
  relevante (global).
- `agendamento` — horario da execucao automatica, formato cron (global).
- `ibama` — quais fontes do IBAMA consultar e a janela de dias (global).
- `diariosEstaduais` — diarios oficiais estaduais (global): `ativo` liga/desliga
  a fonte, `estados` (ex.: `["SP"]`) sobrepoe quais UFs varrer — sem essa lista,
  varre a uniao das UFs das empresas ativas — e `diasMaximos` define a janela
  retroativa de busca em dias.
- `alerta` — se o e-mail esta ativo e o remetente `de` (global). A chave da
  API Resend fica em `config.local.json`. O campo opcional `operador` (array
  de e-mails) define quem recebe o aviso de falha quando o monitor termina
  com problemas (ex.: `"operador": ["ops@empresa.com"]`).
- `manutencao` — configuracoes de manutencao do sistema. Hoje suporta
  `logsDiasReter` (inteiro, padrao 30): numero de dias de logs em `logs/`
  a manter; logs mais antigos sao apagados automaticamente a cada execucao.

> Configuracoes no formato antigo (mono-cliente, com `empresas` no topo) sao
> convertidas automaticamente para um unico cliente `default` — continuam
> funcionando sem edicao.

### `config.local.json` (NAO vai para o git — guarda os segredos)

Aqui mora a chave da API do Resend. Para criar:

1. Copie o modelo `config.local.example.json` para `config.local.json`.
2. Preencha o campo `resendApiKey` com a sua chave do Resend.

O arquivo `config.local.json` esta no `.gitignore` — ele nunca e enviado
para o repositorio. Quando o sistema roda, ele le o `config.json` e
sobrepoe por cima os valores do `config.local.json`.

## Como rodar

### Execucao unica (agora)

```
node monitor.js
```

Roda o monitoramento para a data de hoje. Para uma data especifica:

```
node monitor.js 15-05-2026
```

(O DOU nao publica em sabados e domingos; nesses dias o monitor nao faz nada.)

### Execucao automatica (agendada)

```
node cron.js
```

Mantem um processo rodando que dispara o monitor sozinho no horario
configurado em `config.json` (por padrao, 8h da manha em dias uteis).
Deixe o terminal aberto; para parar, use `Ctrl+C`.

### Painel web (interface de operador)

```
npm run painel
```

Sobe um servidor web local (por padrao na porta 3000) com o painel de
administracao. Antes de usar, defina a senha do painel em `config.local.json`:

```json
{
  "painel": { "senha": "sua-senha-aqui" }
}
```

Acesse `http://localhost:3000` no navegador. O painel exige autenticacao com a
senha configurada acima e oferece:

- **Relatorios** — historico completo de `relatorio-*.json` com status de cada
  execucao (erros, data, publicacoes novas). Clique em qualquer relatorio para
  ver o detalhe por cliente e empresa: publicacoes do DOU, resultados do IBAMA
  e dos diarios estaduais.
- **Varredura manual** — botao "Iniciar Varredura" dispara o monitoramento
  imediatamente (sem esperar o agendamento). O status ("em execucao",
  "concluido", "erro") e atualizado em tempo real.
- **Gerenciar empresas** — tela dedicada para adicionar ou remover empresas de
  cada cliente, com validacao de CNPJ e UF. Alteracoes sao salvas em
  `config.json` imediatamente.

Para encerrar o painel, use `Ctrl+C` no terminal.

### Autoteste das fontes

```
npm run autoteste
```

Checa a conectividade de cada fonte (DOU, IBAMA, DOESP, Resend) e imprime
`OK` ou `FALHOU` por fonte. Sai com codigo 0 se tudo estiver ok, 1 se alguma
fonte falhou. Nao gera relatorio nem envia e-mail.

### Testes

```
npm test
```

Roda a suite de testes automatizados (usa o runner nativo do Node, sem
bibliotecas extras).

## Visao geral da arquitetura

O projeto e um conjunto de modulos simples em JavaScript (CommonJS). Cada
arquivo tem uma responsabilidade clara:

| Arquivo            | Responsabilidade                                            |
|--------------------|-------------------------------------------------------------|
| `monitor.js`       | Orquestra todo o fluxo (DOU + IBAMA + diarios + dedup + alerta) |
| `dou.js`           | Busca publicacoes no portal do DOU                          |
| `ibama.js`         | Baixa e filtra os dados abertos do IBAMA                     |
| `diario-estadual.js` | Registry de diarios estaduais por UF; busca no DOESP (SP)  |
| `icmbio.js`        | Categoriza publicacoes do DOU emitidas pelo ICMBio          |
| `dedup.js`         | Guarda em SQLite o que ja foi alertado, para nao repetir     |
| `alerta.js`        | Monta e envia o e-mail de alerta                            |
| `config-loader.js` | Le e mescla `config.json` + `config.local.json`             |
| `retry.js`         | Reexecuta operacoes de rede que falham (tolerancia a falhas) |
| `log.js`           | Espelha as mensagens do console para arquivos em `logs/`; limpa logs antigos |
| `saude.js`         | Calcula o resumo de saude a partir dos erros do relatorio   |
| `autoteste.js`     | Checa conectividade das fontes; CLI `npm run autoteste`     |
| `cron.js`          | Agendador da execucao automatica                            |
| `painel.js`        | Servidor web do painel de operador (Express + sessao)       |

O ponto de entrada e `monitor.js`. Falhas de rede sao tratadas de forma
resiliente: a busca do DOU e retentada automaticamente, e um erro em uma
empresa ou fonte nao derruba o restante da execucao.

## Execucao automatica no Windows

O monitor pode ser configurado para rodar sozinho toda vez que o computador
for ligado, usando a **pasta de Inicializacao do Windows** (`shell:startup`).

### Passo a passo

1. Abra o Explorador de Arquivos, pressione `Win+R`, digite `shell:startup` e
   clique em OK. Isso abre a pasta onde ficam os programas que sobem
   automaticamente ao ligar o Windows.
2. Crie um atalho para o arquivo `executar-monitor.bat` nessa pasta
   (clique com o botao direito no arquivo > "Criar atalho", depois mova o
   atalho para a pasta de Inicializacao).
3. Pronto. A partir do proximo boot, o Windows executara o bat automaticamente.

### Como funciona o `executar-monitor.bat`

O script faz o seguinte na ordem:

1. Entra na pasta do projeto (`cd /d`).
2. Obtem a data de hoje em formato ISO (`YYYY-MM-DD`) via `node -e`, sem depender
   do formato regional do Windows.
3. **Guarda de "uma vez por dia":** verifica se o arquivo
   `relatorio-AAAA-MM-DD.json` do dia ja existe. Se sim, registra no console
   que o monitor ja rodou hoje e sai com codigo 0 sem fazer nada.
4. Caso o relatorio nao exista, executa `node monitor.js` e propaga o codigo
   de saida (0 = ok, 1 = falha fatal).

Essa guarda evita que o monitor rode duas vezes no mesmo dia caso o computador
seja reiniciado ou entre em hibernacao e volte.

### Agendador de Tarefas (alternativa)

Para quem mantem o computador ligado em horario fixo, o Agendador de Tarefas
do Windows (`taskschd.msc`) e uma alternativa mais precisa: crie uma tarefa
que dispara `executar-monitor.bat` na hora desejada (ex.: 8h em dias uteis).
Essa abordagem **nao** e necessaria se a opcao com a pasta de Inicializacao
acima for suficiente.

### Autoteste das fontes

Para verificar rapidamente se as fontes de dados estao acessiveis:

```
npm run autoteste
```

Abre o navegador, faz uma busca minima no DOU, checa a URL do IBAMA com uma
requisicao leve, testa o DOESP e verifica se a chave Resend esta configurada.
Imprime `OK` ou `FALHOU - <motivo>` por fonte e sai com codigo 0 (tudo ok)
ou 1 (alguma fonte falhou). Nao gera relatorio, nao envia e-mail, nao grava
no banco — serve apenas para diagnosticar conectividade.

O painel tambem oferece um botao **"Testar Fontes"** na tela principal que
dispara o autoteste de forma assincrona e exibe o resultado por fonte.

## Roteiro de desenvolvimento

O sistema esta sendo construido em fases. Este README sera atualizado a
cada etapa concluida.

- **Fase 2** (concluida) — coleta no DOU e IBAMA, deduplicacao, alerta por
  e-mail e agendamento.
- **Fase 3** (concluida):
  - Etapa 1 (concluida) — robustez e cobertura de testes automatizados.
  - Etapa 2 (concluida) — **suporte a multiplos clientes**: cada cliente com
    suas empresas, sua deduplicacao isolada e seu e-mail proprio.
  - Etapa 3 (concluida) — **mais fontes de dados**: diarios oficiais
    estaduais (DOESP) e categorizacao das publicacoes do ICMBio no DOU
    (ver secoes abaixo); o painel web vem na etapa seguinte.
- **Fase 4** (concluida):
  - Etapa 1 (concluida) — **auto-diagnostico e aviso de falha**: o relatorio
    ganha um campo `saude` com status geral e contagem por fonte; quando uma
    fonte falha, o operador recebe um e-mail de aviso automatico separado
    do e-mail dos clientes.
  - Etapa 2 (concluida) — **execucao autonoma no Windows**: `process.exit`
    correto no CLI, script `executar-monitor.bat` para a pasta de
    Inicializacao do Windows e limpeza automatica de logs antigos
    (configuravel em `config.json` > `manutencao.logsDiasReter`).
  - Etapa 3 (concluida) — **autoteste de fontes**: comando
    `npm run autoteste`, botao "Testar Fontes" no painel e rota
    `POST /api/autoteste`.
- **Fase 5** (concluida) — **classificacao de gravidade**: classificador
  deterministico de 8 regras (`classificador.js`), e-mail rico com secao
  "Atencao Imediata" e badges por gravidade, painel com 3 cards de KPI e
  listagem ordenada por criticidade.

## Fase 5 — Classificacao de gravidade

A Fase 5 adiciona gravidade explicita a cada publicacao monitorada, permitindo
priorizar o que e urgente no e-mail e no painel.

### Classificador

- `classificador.js` expoe `classificarPublicacao(pub)` — funcao pura e
  deterministica (sem rede, sem estado).
- 8 regras avaliadas em ordem (primeira que bater vence):
  - **critica** — embargo, interdicao, suspensao ou cassacao de licenca.
  - **alta** — auto de infracao, notificacao.
  - **media** — renovacao de licenca, exigencia/condicionante,
    portaria/resolucao.
  - **baixa** — licenca concedida; fallback para qualquer publicacao nao
    enquadrada nas regras acima.
- Retorno: `{ gravidade, prazo, acao, explicacao }` em portugues sem acento.

### Pipeline

- Publicacoes DOU (`relevantes[]`) e DOESP (`novas[]`) recebem o campo
  `classificacao` no relatorio em disco.
- Fonte IBAMA mantem gravidade inferida pela chave: `autos` → alta,
  `embargos` → critica.

### E-mail

- `alerta.js:gerarHtml` renderiza secao **"Atencao Imediata"** quando ha
  publicacoes criticas/altas (DOU/DOESP) ou novas no IBAMA.
- Badges coloridos por gravidade (CSS inline, sem dependencia externa).
- Rodape com contagem de novas publicacoes, empresas monitoradas e data da
  proxima varredura.

### Dashboard

- Tres cards de KPI no topo: **Alertas urgentes hoje** /
  **Empresas monitoradas** / **Ultima execucao**.
- Badge de gravidade em cada publicacao.
- Listagem ordenada: critica > alta > media > baixa.
- Layout responsivo (abaixo de 600 px colapsa para coluna unica).

### Retrocompatibilidade

- Relatorios anteriores a Fase 5 (sem o campo `classificacao`) continuam
  abrindo no painel e gerando e-mail sem erro.

## Diarios oficiais estaduais

O monitor consulta diarios oficiais estaduais por UF, atraves de um registry
extensivel (`diario-estadual.js`) no mesmo padrao do registry de fontes do
IBAMA. Cada UF registra uma funcao de busca que devolve publicacoes no mesmo
shape normalizado do DOU.

Hoje apenas **Sao Paulo (DOESP)** esta implementado. UFs sem implementacao
sao **puladas com um aviso no console**, sem derrubar o restante do pipeline —
basta registrar uma nova entrada no `diario-estadual.js` para cobrir outro
estado no futuro.

**Investigacao do portal DOESP (maio/2026).** O portal de busca do Diario
Oficial de SP (`doe.sp.gov.br/busca-avancada`) e uma aplicacao de pagina unica
(Next.js). A busca e atendida por um endpoint JSON publico,
`GET https://do-api-web-search.doe.sp.gov.br/v2/advanced-search/publications`
(parametros `Terms`, `FromDate`, `ToDate`, `PageNumber`, `PageSize`). Como o
servico ja devolve JSON, essa fonte nao precisa de navegador (Playwright) —
usa uma requisicao HTTPS direta.

A **busca por CNPJ funciona**, com uma observacao importante: o portal so
encontra o CNPJ quando ele e pesquisado **formatado** (com pontuacao, ex.:
`43.776.491/0001-70`), pois e assim que o numero aparece no texto das
publicacoes. O monitor pesquisa o CNPJ exatamente como ele esta no
`config.json` (formato com pontuacao), entao isso ja esta coberto.

## Categorizacao ICMBio (DOU)

Alem das fontes acima, o monitor identifica no proprio fluxo do DOU as
publicacoes emitidas pelo **ICMBio** (Instituto Chico Mendes de Conservacao
da Biodiversidade). Cada publicacao do DOU passa a ter um campo
`orgaoCategoria`: quando o orgao emissor menciona o ICMBio, o valor e
`"ICMBio"`; caso contrario, `null`.

A logica de categorizacao mora em `icmbio.js`, na funcao **pura e testavel**
`categorizarOrgao` — a mesma publicacao na entrada produz sempre a mesma
saida, sem rede e sem estado. As publicacoes do ICMBio aparecem
**destacadas**: com um selo `[ICMBio]` no relatorio do console, um selo
colorido no e-mail HTML, e um total proprio na linha-resumo do DOU.

### Investigacao de dados abertos do ICMBio (maio/2026)

A etapa tambem previa investigar `dados.gov.br` e o portal do ICMBio atras
de datasets de autuacoes/embargos em Unidades de Conservacao que pudessem
virar uma nova fonte automatica, no mesmo padrao das fontes do IBAMA
(`ibama.js`: download de um zip de CSV, parse em streaming, filtro por CNPJ).

**Resultado:** o ICMBio **publica** dados de fiscalizacao (autos de infracao
e areas embargadas, com atualizacao mensal), porem **apenas em formato
geoespacial** — geoservicos WFS/WMS no geoserver da INDE (camadas
`ICMBio:autos_infracao_icmbio` e `ICMBio:embargos_icmbio`) e arquivos
shapefile / KMZ / XLS no portal de Dados Geoespaciais. **Nao existe** um zip
de CSV em massa equivalente ao `auto_infracao_csv.zip` do IBAMA.

**Limitacao documentada:** por isso, o padrao de fontes do `ibama.js` nao se
aplica ao ICMBio, e **nenhuma fonte automatica de dados abertos do ICMBio foi
adicionada** nesta etapa — faze-lo exigiria inventar o schema de colunas, o
que foi deliberadamente evitado. Integrar essas autuacoes/embargos no futuro
exigiria um modulo geoespacial novo (cliente WFS + parse de GeoJSON/GML),
fora do padrao zip+CSV atual. A cobertura do ICMBio nesta etapa e feita pela
categorizacao das publicacoes do ICMBio no DOU, descrita acima. O comentario
de cabecalho de `icmbio.js` registra essa mesma limitacao no codigo.
