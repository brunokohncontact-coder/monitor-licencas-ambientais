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
  API Resend fica em `config.local.json`.

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
| `log.js`           | Espelha as mensagens do console para arquivos em `logs/`     |
| `cron.js`          | Agendador da execucao automatica                            |

O ponto de entrada e `monitor.js`. Falhas de rede sao tratadas de forma
resiliente: a busca do DOU e retentada automaticamente, e um erro em uma
empresa ou fonte nao derruba o restante da execucao.

## Roteiro de desenvolvimento

O sistema esta sendo construido em fases. Este README sera atualizado a
cada etapa concluida.

- **Fase 2** (concluida) — coleta no DOU e IBAMA, deduplicacao, alerta por
  e-mail e agendamento.
- **Fase 3** (em andamento):
  - Etapa 1 (concluida) — robustez e cobertura de testes automatizados.
  - Etapa 2 (concluida) — **suporte a multiplos clientes**: cada cliente com
    suas empresas, sua deduplicacao isolada e seu e-mail proprio.
  - Etapa 3 (concluida) — **mais fontes de dados**: diarios oficiais
    estaduais (DOESP) e categorizacao das publicacoes do ICMBio no DOU
    (ver secoes abaixo); o painel web vem na etapa seguinte.

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
