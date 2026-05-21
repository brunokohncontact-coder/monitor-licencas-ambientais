# Monitor de Licenciamento Ambiental

Ferramenta que vasculha automaticamente publicacoes oficiais atras de
mencoes a empresas monitoradas e avisa por e-mail quando encontra algo
relevante (licencas, autuacoes, embargos, portarias).

## O que o sistema faz

Todo dia util, para cada empresa cadastrada, o monitor:

1. **Busca no DOU** (Diario Oficial da Uniao) pelo CNPJ da empresa e filtra
   as publicacoes relevantes para a area ambiental.
2. **Consulta os dados abertos do IBAMA** — autos de infracao e termos de
   embargo — cruzando pelo CNPJ.
3. **Deduplica** os resultados: o que ja foi avisado antes nao e avisado de
   novo (controle em banco SQLite).
4. **Envia um e-mail** com tudo que e novo (via servico Resend).
5. **Salva um relatorio** do dia em arquivo `relatorio-AAAA-MM-DD.json`.

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

- `empresas` — lista de empresas monitoradas, cada uma com `nome`, `cnpj` e
  `ativa` (use `false` para pausar sem apagar).
- `filtro` — tipos de publicacao e palavras-chave que definem o que e
  relevante.
- `agendamento` — horario da execucao automatica (formato cron).
- `ibama` — quais fontes do IBAMA consultar e a janela de dias.
- `alerta` — se o e-mail esta ativo, remetente e destinatarios.

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
| `monitor.js`       | Orquestra todo o fluxo (DOU + IBAMA + dedup + alerta)       |
| `dou.js`           | Busca publicacoes no portal do DOU                          |
| `ibama.js`         | Baixa e filtra os dados abertos do IBAMA                     |
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
- **Fase 3** (em andamento) — robustez e testes, suporte a multiplos
  clientes, novas fontes de dados e um painel web.
