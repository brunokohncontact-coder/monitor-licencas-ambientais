# Como rodar o Claudiomiro na Fase 4 — passo a passo

Este guia é para você, Bruno, executar o **Claudiomiro** dentro do **Ubuntu
(WSL)** e deixá-lo implementar a **Fase 4** do Monitor de Licenciamento
Ambiental.

Você não precisa saber programar. Siga os passos na ordem, copiando e colando
um comando de cada vez. Abaixo de cada comando eu digo **o que você deve ver**.

> **Tempo:** o preparo (Passo 1 a 4) leva uns 10–15 minutos. A execução do
> Claudiomiro (Passo 5) é uma sessão longa — de alguns minutos a algumas horas,
> trabalhando sozinho.

---

## Antes de começar — três respostas rápidas

**1. O Claude (aqui no Windows) consegue rodar o Claudiomiro por você?**
Não — e é melhor assim. O Claudiomiro é um processo longo, que trabalha sozinho
por bastante tempo, precisa rodar dentro do Ubuntu na sua máquina e ser
acompanhado por você. Quem dá o comando é você. A minha parte foi **deixar tudo
pronto** para o comando ser um copiar-e-colar.

**2. Você precisa colar o plano inteiro da Fase 4 no terminal?**
Não. O plano está no arquivo `FASE4_PROMPT.md`. O comando do Passo 5 **lê esse
arquivo sozinho** e entrega o conteúdo ao Claudiomiro. Você cola **um comando**,
só isso.

**3. O Claudiomiro lê o documento e começa sozinho?**
Ele não "acha" o arquivo por conta própria — quem aponta o arquivo para ele é o
comando do Passo 5. Mas, na prática, é o que você imaginou: você roda um comando
e ele lê o documento e começa a trabalhar.

---

## O que o Claudiomiro vai (e não vai) fazer

O Claudiomiro é um robô **de programação**. Nesta sessão ele vai:

- Verificar a Etapa 1 da Fase 4 (já implementada) e completar o que faltar.
- Implementar a Etapa 2 (o monitor passar a rodar sozinho quando o PC liga).
- Implementar a Etapa 3 (um autoteste das fontes de dados).
- Rodar os testes automatizados e salvar o trabalho.

O que ele **não** faz — são tarefas suas, manuais, e estão no plano de negócio:
contratar a hospedagem na nuvem, registrar o domínio, abrir o MEI, abrir a conta
de cobrança. Programação ele faz; contratação e burocracia, não.

---

## Passo 1 — Abrir o Ubuntu e ir até a pasta do projeto

Abra o Ubuntu. Quando aparecer a linha de comando, digite:

```bash
cd "/mnt/d/Claude/monitor de licenciamento"
```

> No Ubuntu, o seu disco `D:` se chama `/mnt/d`. As aspas são necessárias porque
> o nome da pasta tem espaços.

Confira que está no lugar certo:

```bash
ls
```

**O que você deve ver:** uma lista com `monitor.js`, `dou.js`, `package.json`,
`FASE4_PROMPT.md`, entre outros. Se aparecer isso, está na pasta certa.

---

## Passo 2 — Preparar o ambiente (só na primeira vez)

São quatro itens. Faça um de cada vez.

### 2.1 — Conferir o Node.js

```bash
node --version
```

**O que você deve ver:** algo como `v20.x` ou maior (ex.: `v24.x`).

### 2.2 — Conferir o Claude Code

```bash
claude --version
```

**O que você deve ver:** um número de versão. Para garantir que ele está
logado, digite `claude` e Enter: se abrir a tela de conversa, está tudo certo —
saia digitando `/exit`. Se ele pedir login, faça o login (vai abrir o navegador)
e depois saia com `/exit`.

### 2.3 — Configurar o git (a "assinatura" do trabalho salvo)

Cole os três comandos, um de cada vez:

```bash
git config --global user.name "rossibruno"
```

```bash
git config --global user.email "brunorossikohn@hotmail.com"
```

```bash
git config --global --add safe.directory "/mnt/d/Claude/monitor de licenciamento"
```

> Os dois primeiros só dizem qual nome assina o trabalho salvo (pode ser
> qualquer nome e e-mail seus). O terceiro autoriza o git a trabalhar nessa
> pasta a partir do Ubuntu — sem ele, dá um erro de "dubious ownership".
> Esses comandos não mostram nada quando dão certo — silêncio é sucesso.

### 2.4 — Instalar o Claudiomiro

```bash
npm install -g claudiomiro
```

**O que você deve ver:** no fim, algo como `added N packages`. Se aparecer um
erro de permissão (com a sigla `EACCES`), rode no lugar:

```bash
sudo npm install -g claudiomiro
```

(O `sudo` vai pedir a senha do seu Ubuntu.)

Confirme que instalou:

```bash
claudiomiro --help
```

**O que você deve ver:** um texto de ajuda com as opções do Claudiomiro.

---

## Passo 3 — Confirmar que o trabalho atual está salvo

O Claudiomiro precisa começar de um ponto limpo. Verifique:

```bash
git status
```

**O que você deve ver:** a frase `nothing to commit, working tree clean`. Se for
isso, **siga para o Passo 4**.

Se aparecer uma lista de arquivos modificados (`monitor.js`, `alerta.js`,
`saude.js`...), o trabalho da Etapa 1 ainda não foi salvo. Salve assim:

```bash
git add -A
```

```bash
git commit -m "Fase 4 Etapa 1 - auto-diagnostico e aviso de falha"
```

> Se você pediu ao Claude para salvar isso por você lá no Windows, o `git status`
> já vai aparecer limpo — aí você nem precisa destes dois comandos.

---

## Passo 4 — Instalar as bibliotecas para o Linux (primeira vez)

```bash
npm install
```

**O que você deve ver:** várias linhas e, no fim, algo como `added N packages`.
Pode levar de um a três minutos.

> **Por quê:** as bibliotecas do projeto tinham sido instaladas para o Windows.
> Este comando reinstala as versões para o Linux, para que os testes rodem no
> Ubuntu.
>
> ⚠️ **Lembrete para depois:** quando você for testar o monitor de volta **no
> Windows**, rode `npm install` lá uma vez também, pelo mesmo motivo. Regra
> simples: trocou de sistema (Windows ↔ Ubuntu), rode `npm install` uma vez.

---

## Passo 5 — Rodar o Claudiomiro na Fase 4

Confirme que está na pasta do projeto e rode o comando:

```bash
cd "/mnt/d/Claude/monitor de licenciamento"
```

```bash
claudiomiro --claude --push=false --prompt="$(cat FASE4_PROMPT.md)"
```

O que cada parte do comando faz:

| Parte | Para que serve |
|---|---|
| `claudiomiro` | chama o robô |
| `--claude` | usa o Claude como cérebro |
| `--push=false` | salva o trabalho **só no seu computador**, sem enviar ao GitHub — assim você revisa antes |
| `--prompt="$(cat FASE4_PROMPT.md)"` | **lê o arquivo `FASE4_PROMPT.md` e entrega o plano inteiro ao Claudiomiro** |

Aperte Enter. A partir daí, o Claudiomiro trabalha **sozinho** — você não precisa
digitar mais nada.

---

## Passo 6 — Enquanto ele trabalha

- **Não feche** a janela do Ubuntu e **não deixe o PC dormir/desligar** até
  terminar.
- Pode levar de **alguns minutos a algumas horas** — é uma sessão longa, e isso
  é normal.
- Você vai ver muitas mensagens passando. Pode acompanhar, mas não precisa fazer
  nada.
- Logo no começo ele cria um arquivo `TODO.md` com a lista de tarefas que
  planejou. Se quiser espiar o plano dele, abra esse arquivo — é opcional.

---

## Passo 7 — Quando terminar

Quando o Claudiomiro disser que terminou:

1. Rode os testes para confirmar que está tudo verde:
   ```bash
   npm test
   ```
   **O que você deve ver:** no fim, `pass` com um número e `fail 0`.

2. Veja o que ele fez:
   ```bash
   git log --oneline -15
   ```

O trabalho fica salvo num **branch novo**, no seu computador, **sem ter sido
enviado ao GitHub** (por causa do `--push=false`). Para revisar esse trabalho e
decidir o que fazer com ele — juntar ao projeto, enviar ao GitHub — **me chame**,
que a gente faz isso junto.

Depois, a validação final da Fase 4 (testar o arquivo `.bat` e a inicialização
automática) é feita **no Windows**. Lembre: ao voltar para o Windows, rode
`npm install` lá uma vez antes de testar.

---

## Se algo der errado

| O que apareceu | O que fazer |
|---|---|
| `claudiomiro: command not found` | O Passo 2.4 não terminou. Refaça-o (com `sudo` se preciso). |
| Erro com `EACCES` no `npm install -g` | Refaça o comando com `sudo` na frente. |
| `detected dubious ownership` | Rode o terceiro comando do Passo 2.3. |
| Erro falando em login / autenticação do Claude | Digite `claude`, faça o login, saia com `/exit`, e rode o Passo 5 de novo. |
| Erro com `better-sqlite3` ou "módulo nativo" | Rode `npm install` de novo dentro do Ubuntu (Passo 4). |
| `npm install` falha citando `node-gyp` ou "compilação" | Rode `sudo apt update && sudo apt install -y build-essential python3` e tente o Passo 4 de novo. |
| Ele parou no meio dizendo que atingiu um limite | Rode o comando do Passo 5 de novo — ele continua de onde parou. |
| `Argument list too long` | Não deve acontecer no Linux. Se acontecer, me chame. |
| Qualquer outra coisa que te deixe inseguro | Pare com `Ctrl+C`, copie as mensagens e me traga — a gente resolve junto. |

---

*Guia preparado para a Fase 4. A próxima fase de desenvolvimento (camada de
interpretação por IA, rastreamento de prazos, cobertura multi-estado) terá o seu
próprio plano e o seu próprio guia quando chegar a hora.*
