# Plano de Negócio e Produto — Monitor de Licenciamento Ambiental

**Data:** 21/05/2026
**Autor:** Bruno
**Status do produto:** fim da Fase 3 (funcional); Fase 4 especificada, não implementada
**Para que serve este documento:** orientar as decisões de **planejamento e estratégia** durante a fase de desenvolvimento — quanto vale a ferramenta, quanto cobrar, quanto custa operar, quanto dá para faturar e o que falta para ela virar um produto vendável.

> Os números deste documento são **estimativas de planejamento**, não promessas. Eles servem para você raciocinar e decidir. Onde houver suposição relevante, ela está marcada como **[suposição]** — se a realidade for diferente, me diga e eu reviso.

---

## Índice

1. [Sumário executivo](#1-sumário-executivo)
2. [Que tipo de documento é este](#2-que-tipo-de-documento-é-este)
3. [O produto hoje](#3-o-produto-hoje)
4. [O problema, o mercado e o público-alvo](#4-o-problema-o-mercado-e-o-público-alvo)
5. [Proposta de valor — o valor real para o cliente](#5-proposta-de-valor--o-valor-real-para-o-cliente)
6. [Precificação recomendada](#6-precificação-recomendada)
7. [Estrutura de custos](#7-estrutura-de-custos)
8. [Projeção de faturamento](#8-projeção-de-faturamento)
9. [Avaliação da plataforma — estado atual × estado ideal](#9-avaliação-da-plataforma--estado-atual--estado-ideal)
10. [É um diferencial?](#10-é-um-diferencial)
11. [Roteiro estratégico recomendado](#11-roteiro-estratégico-recomendado)
12. [Riscos e mitigação](#12-riscos-e-mitigação)
13. [Lean Canvas (uma página)](#13-lean-canvas-uma-página)
14. [Próximos passos imediatos](#14-próximos-passos-imediatos)

---

## 1. Sumário executivo

**O que é o produto.** Um robô que, todo dia útil, varre as publicações oficiais
do governo (Diário Oficial da União, dados abertos do IBAMA e diários oficiais
estaduais) procurando o CNPJ das empresas monitoradas e avisa por e-mail quando
encontra algo relevante para licenciamento ambiental — licenças, autuações,
embargos, portarias.

**Para quem.** Quem é responsável por não deixar passar nada na vida ambiental de
uma empresa: **consultorias e escritórios ambientais** (que cuidam de uma
carteira de clientes), **empresas com operação sujeita a licença** (indústria,
agro, mineração, energia, logística) e **profissionais autônomos** da área.

**O valor real.** Duas coisas, e a segunda é a mais importante:

1. **Tempo.** Substitui de 5 a 35 horas por mês de checagem manual em vários
   portais (depende do tamanho da carteira).
2. **Risco.** Funciona como uma **apólice de seguro**: perder a publicação de um
   auto de infração significa perder o prazo de defesa (cerca de 20 dias);
   perder o aviso de vencimento significa operar sem licença. Um único erro
   desses custa de **dezenas a centenas de milhares de reais** em multa, embargo
   e parada de operação. A ferramenta existe para que isso não aconteça.

**Quanto cobrar (recomendação).** Preço **baseado em valor**, em planos por
quantidade de CNPJs monitorados:

| Plano | Para quem | CNPJs | Mensal | Setup (única vez) |
|---|---|---|---|---|
| Essencial | Autônomo / micro consultoria | até 5 | **R$ 197** | R$ 250 |
| Profissional | Consultoria pequena/média, empresa | até 20 | **R$ 497** | R$ 400 |
| Empresarial | Consultoria grande, grupo de empresas | até 60 | **R$ 1.200** | R$ 600 |
| Sob medida | Acima de 60 CNPJs, estados específicos, SLA | 60+ | **a partir de R$ 2.000** | sob consulta |

**Quanto custa operar.** Muito pouco. Hoje, na sua máquina: praticamente **R$ 0**.
Profissionalizado na nuvem, com os primeiros clientes: **R$ 110 a R$ 220/mês**.
Em escala (50+ clientes): **R$ 800 a R$ 2.000/mês**. O custo dominante não é
dinheiro — é o **seu tempo**. E o custo de adicionar mais um cliente é quase
zero, o que significa **margem de lucro muito alta** (na faixa de 85–95%).

**Quanto dá para faentar (cenário-base, 1º ano).** Vendendo em meio período,
chegando a ~17 clientes no mês 12, com ticket médio de ~R$ 460: **MRR de saída
de ~R$ 7.800/mês** (≈ R$ 93 mil/ano de receita anualizada), com ~R$ 43 mil
efetivamente recebidos ao longo do primeiro ano. Cenário conservador: metade
disso. Cenário otimista (fechando 2–3 consultorias grandes): MRR de saída de
R$ 16–18 mil/mês.

**As 3 jogadas mais importantes agora:**

1. **Tornar confiável e independente da sua máquina** — concluir a Fase 4 e
   subir para uma hospedagem na nuvem 24/7. Sem isso não dá para cobrar.
2. **Transformar "detecção" em "interpretação"** — adicionar uma camada de IA
   que classifica a gravidade e explica, em linguagem clara, o que cada
   publicação significa e qual o prazo. É isso que vira um **diferencial real**.
3. **Ampliar a cobertura de estados** — hoje só SP. As consultorias (os melhores
   clientes) têm clientes em vários estados.

---

## 2. Que tipo de documento é este

Você perguntou se existe um "documento padrão" que se usa quando se tem uma ideia
para desenvolver. Existe — na verdade, existem vários, cada um para um momento:

| Documento | Para que serve | Quando usar |
|---|---|---|
| **Lean Canvas** | Resumo de uma página do modelo de negócio (problema, solução, clientes, receita, custo, diferencial) | Bem no começo, para ter clareza rápida. *Está preenchido na seção 13.* |
| **Business Case** | Justifica se vale a pena investir tempo/dinheiro: custos × benefícios × risco | Para decidir "sigo ou não sigo" |
| **Plano de Negócio** | Documento completo: mercado, produto, marketing, operação, finanças | Para organizar a execução e, se for o caso, buscar crédito/sócio |
| **PRD (documento de requisitos de produto)** | Define o que o produto precisa fazer | Para guiar o desenvolvimento (você já vem fazendo isso com os `FASE*_PROMPT.md`) |
| **Plano de Go-to-Market** | Como chegar ao cliente e vender | Quando o produto está perto de vender |
| **Pitch Deck** | Apresentação em slides para investidor/sócio | Só se for buscar investimento |

**Este documento** é um híbrido prático para o seu momento: um **Business Case +
Plano de Negócio enxuto + Avaliação de Produto**. Ele responde "vale a pena?",
"quanto cobrar e quanto custa?" e "o que falta no produto?".

> **Dica gratuita e brasileira:** o **SEBRAE** oferece modelos de plano de
> negócio, oficinas de Canvas e consultoria de graça. Vale como apoio — e, se for
> formalizar como MEI/empresa, eles ajudam nisso também.

Sugiro tratar este arquivo como um **documento vivo**: ele está no repositório,
você atualiza conforme o produto e a realidade comercial evoluem.

---

## 3. O produto hoje

Descrição factual do que existe hoje (para o documento se sustentar sozinho):

**O que o sistema faz, todo dia útil, para cada cliente e cada empresa:**

- Busca no **DOU** (Diário Oficial da União) pelo CNPJ e filtra o que é
  relevante para a área ambiental.
- Consulta os **dados abertos do IBAMA** — autos de infração e termos de embargo.
- Consulta **diários oficiais estaduais** — hoje, **apenas São Paulo (DOESP)**.
- Identifica e destaca publicações do **ICMBio** dentro do DOU.
- **Deduplica** por cliente (não avisa duas vezes a mesma coisa).
- **Envia um e-mail por cliente** só com os achados daquele cliente.
- **Salva um relatório** do dia em arquivo.

**Capacidades já construídas:**

- **Multi-cliente**: cada cliente tem sua própria lista de empresas, sua
  deduplicação isolada e seus próprios destinatários de e-mail.
- **Painel web de operador**: histórico de relatórios, varredura manual,
  cadastro de empresas.
- **Robustez**: 69 testes automatizados; falha em uma fonte ou empresa não
  derruba o resto.

**O que está especificado mas ainda não construído (Fase 4):**

- Autodiagnóstico (o monitor sabe e avisa quando ele mesmo falha).
- Execução autônoma no Windows (rodar sozinho, sem terminal aberto).
- Autoteste das fontes.

**Limitações honestas do estado atual:**

- Roda **na sua máquina** — se o PC estiver desligado, não há monitoramento.
- O e-mail sai de um **remetente de teste** (`onboarding@resend.dev`).
- Diários estaduais cobrem **só SP**.
- O filtro é por **palavra-chave** — detecta menções, mas não interpreta nem
  classifica a gravidade.
- Não há **cobrança**, **cadastro de clientes** nem **portal para o cliente**.

A seção 9 transforma essa lista em um plano.

---

## 4. O problema, o mercado e o público-alvo

### O problema

No Brasil, qualquer operação que use recursos naturais ou possa poluir precisa de
**licença ambiental** (LP — Prévia, LI — Instalação, LO — Operação). Cada licença
tem prazo de validade, **condicionantes** a cumprir e precisa ser **renovada** —
a renovação da LO, por exemplo, deve ser pedida com **antecedência de 120 dias**
(Resolução CONAMA 237/1997). Além disso, os órgãos ambientais publicam **autos de
infração** e **embargos**, e o autuado tem um prazo curto — da ordem de **20
dias** — para apresentar defesa.

Toda essa vida administrativa aparece em **publicações oficiais**: o DOU
(federal), os diários estaduais (CETESB/SP, INEA/RJ, IAT/PR, FEAM/MG etc.) e os
dados do IBAMA. Quem cuida de uma empresa precisa **vigiar esses canais**.

**Como isso é feito hoje, sem ferramenta:** alguém entra manualmente em cada
portal, pesquisa nome ou CNPJ, lê os resultados e tenta não deixar nada passar.
É um trabalho chato, repetitivo, e — o pior — **fácil de falhar**: basta um dia
sem checar, um portal fora do ar, uma pesquisa mal feita.

**O custo de falhar é alto.** Perder um auto de infração = perder o prazo de
defesa e a multa vira definitiva. Operar com a licença vencida = sujeito a
embargo e a multa que, pela legislação (Decreto 6.514/2008), vai de R$ 500 a
R$ 10 milhões, além de responsabilidade na Lei de Crimes Ambientais
(9.605/1998). Some-se a parada de operação, problemas com auditoria, ESG e
clientes. *(Valores legais citados como ordem de grandeza — confirme os números
vigentes com um profissional jurídico.)*

### O público-alvo (três segmentos)

| Segmento | Quem é | Dor principal | Quanto pode pagar |
|---|---|---|---|
| **Consultorias e escritórios ambientais** | Cuidam de uma carteira de 15–50+ empresas-clientes | Volume: vigiar dezenas de CNPJs em vários estados, todo dia | Alto — é insumo do serviço que eles vendem |
| **Empresas finais** | Indústria, agro, mineração, energia, logística com licenças próprias | Risco: uma falha respinga em multa e parada de operação | Alto — para uma empresa grande, o custo da ferramenta é irrelevante perto do risco |
| **Profissionais autônomos** | Consultor(a) ou advogado(a) ambiental individual | Tempo: faz tudo sozinho, não dá conta de vigiar manualmente | Médio — sensível a preço, mas valoriza ganhar tempo |

**Recomendação estratégica — por onde começar:** foque primeiro nas
**consultorias ambientais**. Três motivos: (1) a arquitetura multi-cliente do seu
produto já foi feita para isso — uma consultoria é um "cliente" com vários
"empresas"; (2) cada consultoria vale mais (mais CNPJs = plano maior); (3) uma
consultoria satisfeita vira **canal de indicação** para outras. Empresas finais e
autônomos entram em paralelo, sem esforço extra de produto.

> **Sobre "pessoa ou empresa":** a estrutura de planos da seção 6 atende os dois.
> Um autônomo entra no plano Essencial; uma empresa ou consultoria, no
> Profissional ou Empresarial. O que muda não é o produto — é o tamanho da
> carteira de CNPJs.

---

## 5. Proposta de valor — o valor real para o cliente

O valor da ferramenta tem **dois pilares**. Vender só o primeiro é subprecificar.

### Pilar 1 — Tempo economizado (o argumento da eficiência)

Checar manualmente um CNPJ no DOU + um diário estadual + IBAMA leva, feito com
cuidado, de **3 a 8 minutos por CNPJ por dia útil**. Multiplicando:

| Segmento | CNPJs típicos | Horas/mês economizadas | Custo interno da hora **[suposição]** | Valor recuperado/mês |
|---|---|---|---|---|
| Autônomo | 3–5 | 5–10 h | R$ 60–120 | **R$ 300 – 1.000** |
| Consultoria | 15–40 | 15–35 h | R$ 40–80 (analista) | **R$ 700 – 2.500** |
| Empresa final | 5–15 | 6–15 h | R$ 50–95 (analista) | **R$ 350 – 1.200** |

> Observação importante: na prática, muita gente **não faz** essa checagem todo
> dia — é trabalhosa demais. Aí o valor da ferramenta é ainda maior: ela faz o
> que **deveria** ser feito e não é. O "custo da hora" acima é conservador (custo
> interno do funcionário). Se você medir pelo **valor de oportunidade** — a hora
> que a consultoria poderia estar **faturando** do cliente, R$ 120–300/h — o
> valor recuperado triplica.

### Pilar 2 — Risco evitado (o argumento do seguro) — **este é o grande**

Tempo é o que se mede fácil. Mas o cliente não compra a ferramenta para
economizar 20 horas — compra para **dormir tranquilo**. O cálculo é simples:

- Um único auto de infração não visto → prazo de defesa perdido → multa de
  **dezenas de milhares de reais** vira definitiva.
- Uma renovação de licença não acompanhada → operação sem licença → embargo +
  multa que pode passar de **R$ 100 mil** + parada de produção.

Ou seja: **um único incidente evitado paga vários anos de assinatura.** É assim
que se vende e se precifica a ferramenta — como uma apólice barata contra um
prejuízo caro. A mensagem para o cliente não é "economize tempo", é:

> *"Enquanto você cuida do seu trabalho, nada relevante sobre as suas empresas
> passa despercebido nos diários oficiais. Se aparecer um auto, um embargo ou um
> prazo, você sabe no mesmo dia."*

### Conclusão para a precificação

Some os dois pilares: para uma **consultoria**, a ferramenta entrega facilmente
**R$ 1.000 a R$ 2.500/mês só em tempo**, mais um valor de risco que vale muito
mais. A regra de bolso de precificação por valor diz para **capturar de 10% a 20%
do valor entregue**. Isso coloca o preço de uma consultoria com folga na faixa de
**R$ 400 a R$ 700/mês** — e ainda assim com um retorno (ROI) de 3 a 6 vezes para
o cliente **só contando o tempo**, antes de contar o risco. É um "sim" fácil.

---

## 6. Precificação recomendada

### O método (o "porquê" dos números)

1. **Preço por valor, não por custo.** O custo de operar é quase zero (seção 7).
   Se você precificar por custo, vai cobrar uma ninharia por algo que vale muito.
   Precifique pelo valor da seção 5.
2. **A métrica de cobrança é o nº de CNPJs monitorados.** É o que o cliente
   entende, cresce junto com o valor entregue e funciona tanto para autônomo
   quanto para empresa e consultoria.
3. **Planos em degraus, não preço sob medida para cada um.** Degraus são fáceis
   de vender e de entender.
4. **Taxa de setup única.** Cobrir o seu tempo de configuração inicial, filtrar
   curioso de cliente sério, e sinalizar que é um serviço, não um app de R$ 9.
5. **Finais 7/97** (R$ 197, R$ 497) — convenção de mercado digital no Brasil;
   ancoram a percepção em "abaixo de 200/500".

### Tabela de planos recomendada

| Plano | Para quem | CNPJs | **Mensal** | Setup único | Anual (2 meses grátis) |
|---|---|---|---|---|---|
| **Essencial** | Autônomo, micro consultoria | até 5 | **R$ 197** | R$ 250 | R$ 1.970 |
| **Profissional** | Consultoria pequena/média, empresa | até 20 | **R$ 497** | R$ 400 | R$ 4.970 |
| **Empresarial** | Consultoria grande, grupo de empresas | até 60 | **R$ 1.200** | R$ 600 | R$ 12.000 |
| **Sob medida** | 60+ CNPJs, estados específicos, SLA | 60+ | **a partir de R$ 2.000** | sob consulta | negociado |

**Detalhes e racional:**

- **O salto de R$ 197 para R$ 497 é proposital.** Ele empurra a consultoria — seu
  melhor cliente — para o plano Profissional. Quem tem 12 CNPJs não vai querer
  espremer no Essencial de 5.
- **Plano anual com 2 meses grátis** (pague 10, leve 12 — ~17% de desconto):
  melhora o seu caixa e reduz cancelamento.
- **Alternativa por CNPJ:** para o cliente do "meio-termo" (ex.: tem só 8 CNPJs e
  acha o Profissional folgado), ofereça **R$ 35–45 por CNPJ/mês, com mínimo de
  R$ 197**. Mantém a venda viva sem criar um plano novo.
- **Preço de fundador (essencial no começo):** os **3 a 5 primeiros clientes**
  entram com **40–50% de desconto vitalício** em troca de: depoimento, estudo de
  caso e feedback. Você precisa de prova social mais do que de margem agora.
- **Reajuste:** deixe no contrato o reajuste anual por um índice (ex.: IPCA).

### Onde cada perfil entra

- **Uma pessoa (autônomo):** plano **Essencial, R$ 197/mês**.
- **Uma empresa monitorando a si mesma:** normalmente **Profissional, R$ 497/mês**
  (poucos CNPJs, mas pode subir para Empresarial se for um grupo).
- **Uma consultoria:** **Profissional ou Empresarial** conforme a carteira — é
  aqui que está o melhor faturamento por cliente.

---

## 7. Estrutura de custos

A boa notícia financeira deste negócio: **o custo de operação é baixíssimo, e o
custo de cada cliente novo é quase zero.** Isso significa margem de lucro alta.

### Cenário A — Hoje (rodando na sua máquina)

| Item | Custo mensal |
|---|---|
| Envio de e-mail (Resend, plano gratuito) | R$ 0 |
| Domínio próprio (quando registrar) | ~R$ 4 (≈ R$ 50/ano) |
| Energia / PC ligado | R$ 0–30 |
| **Total em dinheiro** | **~R$ 5 – 35/mês** |

O custo real aqui é o **seu tempo** (operar, configurar, dar suporte) — que não
sai do bolso, mas é finito.

### Cenário B — Profissionalizado (nuvem, primeiros ~15–20 clientes)

| Item | Custo mensal | Observação |
|---|---|---|
| Servidor na nuvem (VPS Linux, roda 24/7) | R$ 30–90 | Substitui o seu PC; o monitor passa a rodar sozinho |
| Envio de e-mail (Resend) | R$ 0 | O plano gratuito cobre tranquilamente as primeiras dezenas de clientes |
| Domínio próprio | ~R$ 4 | |
| Formalização — MEI (DAS mensal) | ~R$ 75–80 | Dá CNPJ e permite emitir nota fiscal |
| Monitoramento/backup | R$ 0–50 | Dá para usar planos gratuitos no começo |
| **Total** | **~R$ 110 – 220/mês** | |

### Cenário C — Escala (SaaS, 50+ clientes)

| Item | Custo mensal | Observação |
|---|---|---|
| Servidor maior + banco gerenciado | R$ 150–500 | |
| Envio de e-mail (Resend, plano pago) | R$ 110–300 | |
| Gateway de cobrança (Asaas/Cora) | ~1–2% do faturamento | Pix é barato; cartão ~3–4% |
| Contador (vira ME no Simples Nacional) | R$ 250–500 | |
| Impostos (Simples Nacional) | a partir de ~6% do faturamento | **Confirme o anexo com um contador — pode cair no Anexo V** |
| Ferramentas (uptime, CRM, suporte) | R$ 50–200 | |
| (Opcional) IA para classificar publicações (Claude API) | R$ 50–300 | Conforme o volume — ver seção 11 |
| **Total** | **~R$ 800 – 2.000/mês + impostos** | Com 50+ clientes o MRR já passa de R$ 20 mil; a margem segue em ~85–90% |

### A leitura financeira

- **Custo variável por cliente ≈ zero.** Mais um cliente é só mais alguns
  e-mails e um pouco de processamento. Quase toda mensalidade nova vira lucro.
- **O gargalo não é dinheiro — é o seu tempo** (vender, configurar, dar
  suporte) e a **prontidão do produto** (seção 9).
- **Atenção ao teto do MEI:** o MEI tem limite de faturamento de **R$ 81 mil/ano**
  *(confira o teto vigente)*. Nos cenários base e otimista da seção 8 você
  ultrapassa esse teto — então planeje a migração de **MEI → ME (Microempresa,
  Simples Nacional)** com um contador antes de bater o limite.

---

## 8. Projeção de faturamento

**Glossário rápido:** **MRR** = receita recorrente mensal (a soma de todas as
mensalidades ativas). **Churn** = taxa de cancelamento. **Ticket médio** = valor
médio pago por cliente. **Run-rate** = o MRR de um mês multiplicado por 12 (a
receita anualizada "se tudo continuar assim").

### Suposições do cenário-base **[suposição]**

- Você vende em **meio período**, sozinho, por indicação e contato direto.
- O produto fica **vendável** por volta do mês 2 (domínio, hospedagem, contrato).
- Ritmo de ~**1 a 2 clientes novos por mês** depois disso.
- **Ticket médio de ~R$ 460/mês** (mistura de Essencial e Profissional, com
  alguns Empresariais).
- **Churn baixo** — ferramenta de compliance "gruda"; ~1 cliente perdido no ano.

### Cenário-base, mês a mês (1º ano)

| Mês | Novos | Total de clientes | MRR (R$) | Observação |
|---|---|---|---|---|
| 1 | 0 | 0 | 0 | Preparação: domínio, hospedagem, contrato, Fase 4 |
| 2 | 2 | 2 | ~500 | 2 clientes-piloto a preço de fundador |
| 3 | 1 | 3 | ~1.000 | Primeiros depoimentos |
| 4 | 1 | 4 | ~1.500 | |
| 5 | 2 | 6 | ~2.400 | |
| 6 | 1 | 7 | ~3.000 | |
| 7 | 2 | 9 | ~3.900 | |
| 8 | 1 | 10 | ~4.400 | |
| 9 | 2 | 12 | ~5.400 | |
| 10 | 1 | 13 | ~5.900 | |
| 11 | 2 | 15 | ~6.900 | |
| 12 | 2 | 17 | **~7.800** | Run-rate ≈ **R$ 93 mil/ano** |

**Recebido ao longo do 1º ano (soma das mensalidades):** ≈ **R$ 43 mil**.
**Custo do ano:** ~R$ 1.500 a R$ 3.000 (seção 7). **Lucro do 1º ano:** ≈ R$ 40 mil.

### Os três cenários

| Cenário | Clientes no mês 12 | MRR no mês 12 | Recebido no 1º ano | Run-rate de saída |
|---|---|---|---|---|
| **Conservador** | 8–9 | ~R$ 3.500 | ~R$ 20–22 mil | ~R$ 42 mil/ano |
| **Base** | 16–18 | ~R$ 7.800 | ~R$ 43 mil | ~R$ 93 mil/ano |
| **Otimista** | 22–25 | ~R$ 16–18 mil | ~R$ 90–100 mil | ~R$ 200 mil/ano |

O cenário **otimista** assume fechar **2–3 consultorias grandes** (plano
Empresarial) cedo — o que reforça a recomendação da seção 4 de focar nelas.

### Unidade econômica (a saúde de cada cliente)

- **LTV (valor total de um cliente ao longo da vida):** ticket R$ 460 × margem
  ~90% × ~30 meses de permanência ≈ **R$ 12.000 por cliente**.
- **CAC (custo de aquisição):** dominado pelo seu tempo; em dinheiro, perto de
  **R$ 0–200** por cliente (venda direta/indicação).
- **Relação LTV/CAC:** altíssima. O negócio **não é limitado por economia** — é
  limitado pela sua **capacidade de vender** e pela **prontidão do produto**.

### Leitura honesta

Venda B2B de compliance é baseada em **confiança** e tem ciclo **lento** — o
cliente precisa confiar que a ferramenta não vai falhar justo no dia que importa.
Por isso: **planeje pelo cenário conservador**, comemore o base. E o resultado de
caixa do 1º ano não é o ponto — o ponto é **terminar o ano com um MRR
sólido**, previsível e que cresce, com clientes satisfeitos servindo de prova
social. É o ano 2 que colhe.

---

## 9. Avaliação da plataforma — estado atual × estado ideal

A matriz abaixo é o **coração do seu planejamento de produto**. "Bloqueia venda"
= precisa estar resolvido **antes** do primeiro cliente pagante.

| Dimensão | Estado atual | Estado ideal | Prioridade |
|---|---|---|---|
| **Coleta de dados** | DOU nacional + IBAMA nacional + DOESP (só SP) + ICMBio no DOU | Cobertura dos ~8 estados de maior demanda + DF | **Alta** |
| **Confiabilidade / operação** | Roda na sua máquina; Fase 4 (autodiagnóstico, execução autônoma) especificada, não implementada | Hospedagem 24/7 na nuvem + autodiagnóstico ativo + autoteste de fontes | **Alta — bloqueia venda** |
| **Qualidade do alerta** | Filtro por palavra-chave; entrega o texto cru da publicação | Classificação por gravidade + resumo em linguagem clara + "o que fazer / qual o prazo" | **Alta — vira diferencial** |
| **Entrega ao cliente** | E-mail por cliente, de um **remetente de teste** | Domínio próprio autenticado + e-mail profissional + WhatsApp para urgências | **Alta — bloqueia venda (rápido de resolver)** |
| **Cobrança / assinatura** | Não existe | Cobrança recorrente (Asaas/Cora), controle de planos e inadimplência | **Alta — bloqueia venda** |
| **Jurídico / formalização** | Não existe | CNPJ (MEI), contrato de prestação de serviço, política de privacidade, termos de uso | **Alta — bloqueia venda** |
| **Rastreamento de prazos** | Não existe (só detecta o que já saiu) | Avisa vencimento de licença (120 dias) e prazo de defesa de auto (~20 dias) | **Média-alta — diferencial** |
| **Experiência do cliente** | Nenhuma — o cliente só recebe e-mail | Portal com login: histórico, prazos, autoatendimento | **Média** |
| **Histórico / auditoria** | A deduplicação guarda só a "chave", sem o conteúdo | Histórico com cópia do conteúdo ("prove que me avisou em tal dia") | **Média** |
| **Administração interna** | Painel de operador com 1 senha | Onboarding ágil de cliente; painel multiusuário | **Baixa-média** |

### Pontos fortes que você já tem

- Um **pipeline real e funcionando** — não é protótipo. Coleta, deduplica e
  avisa, em três fontes, com 69 testes automatizados.
- A **arquitetura multi-cliente** — fundamental para vender a consultorias —
  **já existe**.
- Tratamento de erro **resiliente** — uma fonte que cai não derruba o resto.
- Um **painel web** de operação já pronto.
- **Custo de operação quase zero** — você tem fôlego para crescer devagar sem
  queimar dinheiro.

### Os 6 vãos que separam "ferramenta" de "produto vendável"

1. **Confiar a operação à sua máquina.** Para um serviço pago, o monitoramento
   tem que rodar 24/7 independente de você. Resolver: concluir a Fase 4 **e**
   subir para uma VPS na nuvem.
2. **Remetente de e-mail de teste.** `onboarding@resend.dev` cai em spam e passa
   amadorismo. Resolver: domínio próprio autenticado (rápido e barato).
3. **Cobertura de um estado só.** Uma consultoria com clientes em MG, PR e RJ não
   é bem servida. Resolver: expandir estados por demanda real.
4. **Alerta sem interpretação.** Hoje entrega o texto cru; o cliente ainda
   precisa ler e julgar. O ideal é entregar o julgamento pronto.
5. **Sem cobrança nem cadastro.** Não há como assinar nem pagar. No começo dá
   para fazer manualmente (cobrança via Asaas/Pix), mas precisa existir.
6. **Sem proteção jurídica.** Contrato, termos e política de privacidade — ver
   seções 11 e 12.

---

## 10. É um diferencial?

Resposta honesta: **hoje, é um diferencial modesto. Com as adições certas, vira
um diferencial real.** Vamos por partes.

**A ideia em si não é única.** Monitorar publicações oficiais é um mercado
maduro no jurídico (monitoramento de processos e publicações judiciais). Existem
serviços genéricos de "recorte" de diário oficial. A tecnologia de varredura é
*commodity* — não é o seu diferencial.

**O que pode ser, de fato, diferencial:**

1. **Foco no nicho.** Não é um recortador genérico — é **feito para
   licenciamento ambiental**. Fala a língua do cliente: licença, condicionante,
   auto de infração, embargo. Um produto focado vende melhor que um genérico.
2. **Várias fontes em um lugar só.** DOU + IBAMA + diários estaduais unificados.
   Fazer isso na mão é visitar vários portais diferentes.
3. **O modelo de carteira.** Um painel para todos os CNPJs dos clientes de uma
   consultoria. Encaixa exatamente na rotina dela.
4. **(O grande) Interpretar, não só detectar.** Se você adicionar a camada de IA
   que **classifica a gravidade**, **resume em linguagem clara** e diz **o que
   fazer e qual o prazo** — aí sim você sai de "robô de busca" para **"radar de
   compliance"**. Isso um recortador genérico não faz. Esse é o fosso defensivo.
5. **Rastreamento de prazos.** Avisar "a LO da empresa X vence em 120 dias" muda
   o produto de **reativo** (avisa o que já saiu) para **proativo** (avisa o que
   vai vencer). É o tipo de coisa pela qual o cliente paga de bom grado.

**Conclusão:** o seu diferencial **não está pronto — está ao seu alcance.** O
estado atual é uma base sólida. As adições da seção 11 (interpretação por IA +
prazos + multi-estado) são o que transformam a plataforma de "útil" em
"difícil de abrir mão".

---

## 11. Roteiro estratégico recomendado

### Fase 0 — Antes do primeiro cliente pagante (as travas)

Checklist do que **precisa existir** para você poder cobrar com segurança:

- [ ] **Concluir a Fase 4** — confiabilidade: o monitor sabe e avisa quando
      falha. Já está toda especificada no `FASE4_PROMPT.md`.
- [ ] **Hospedagem 24/7 na nuvem** — uma VPS Linux barata (R$ 30–90/mês). O
      monitor passa a rodar sozinho, independente do seu PC. *(Recomendo a VPS em
      vez de depender do Agendador do Windows na sua máquina — é o que torna o
      serviço confiável de verdade.)*
- [ ] **Domínio próprio + e-mail autenticado** — sair do `onboarding@resend.dev`.
      Barato e rápido; resolve entregabilidade e imagem.
- [ ] **Formalização** — abrir **MEI** (dá CNPJ e nota fiscal).
- [ ] **Cobrança recorrente** — conta no **Asaas** ou **Cora** (cobram Pix/boleto
      recorrente, com baixo custo e bom para o Brasil).
- [ ] **Proteção jurídica** — contrato de prestação de serviço, termos de uso e
      política de privacidade. **Cláusula essencial:** deixar claro que o serviço
      é um **monitoramento auxiliar**, *best effort*, **sem garantia de captura
      de 100%** das publicações, e que **não substitui** a responsabilidade
      própria do cliente. Isso protege você (ver seção 12).
- [ ] **Material de venda** — uma página simples explicando o serviço + um
      e-mail de alerta de exemplo, bem formatado, para mostrar ao cliente.
- [ ] **Definir os 2–3 primeiros pilotos** — gente da sua rede, a preço de
      fundador.

### Fase 1 — Primeiros 90 dias (validar e provar)

- Rodar os pilotos, coletar **feedback e depoimentos**.
- Ajustar o filtro de relevância com casos reais (o `ROADMAP.md` já prevê um
  script de auditoria de falsos positivos — use-o).
- Fechar os **primeiros clientes pagantes** por indicação dos pilotos.
- Meta realista: **3 a 5 clientes pagantes** ao fim dos 90 dias.

### Fase 2 — Meses 4 a 12 (transformar em diferencial)

Roadmap de produto, em ordem de prioridade — cada item amarrado ao valor:

1. **Multi-estado.** Adicionar estados conforme a demanda real dos clientes
   (provavelmente MG, PR, RJ, RS, SC...). A arquitetura de "registry" de diários
   já está pronta para isso. → *Remove o maior bloqueio de venda para
   consultorias.*
2. **Camada de interpretação por IA.** Usar a API da Claude para, em cada
   publicação, gerar: um **resumo em linguagem clara**, uma **classificação de
   gravidade** (alta/média/baixa) e uma linha de **"o que fazer / prazo"**.
   → *É o que vira diferencial real (seção 10). Custo: R$ 50–300/mês conforme
   volume — pequeno perto do valor.*
3. **Rastreamento de prazos.** Avisar vencimento de licença (120 dias) e prazo
   de defesa de auto (~20 dias). → *Muda o produto de reativo para proativo.*
4. **Histórico/auditoria com conteúdo.** Guardar a cópia do que foi avisado.
   → *Sustenta o argumento "tenho prova de que te avisei".*
5. **Portal do cliente.** Login para o cliente ver histórico, prazos e gerenciar
   as próprias empresas. → *Reduz o seu trabalho de suporte e prepara a escala.*
6. **Alertas por WhatsApp** para o que for urgente. → *O brasileiro lê WhatsApp;
   um auto de infração não pode esperar o cliente abrir o e-mail.*

### Sobre o modelo de operação

Recomendo o caminho **"serviço gerenciado primeiro, SaaS depois"**:

- **Agora:** modelo **gerenciado** — você opera, o cliente só recebe os alertas.
  Tem uma vantagem: o contato direto com os primeiros clientes te ensina o que o
  produto precisa ter. E o trabalho manual de configurar 5–10 clientes é
  perfeitamente administrável.
- **Quando passar de ~15–20 clientes:** o trabalho manual começa a pesar — aí
  vale investir no **portal de autoatendimento** (item 5 acima) e migrar para um
  **SaaS** onde o cliente se cadastra sozinho.

Não tente construir o SaaS completo agora. Valide primeiro com o modelo
gerenciado; ele custa quase nada e ensina muito.

---

## 12. Riscos e mitigação

| Risco | Descrição | Mitigação |
|---|---|---|
| **Fragilidade da varredura** | Os portais mudam de layout e quebram o robô; o portal do DOU é instável (mesma busca dá resultados diferentes) | Fase 4 (autoteste de fontes + aviso de falha); reservar um tempo mensal de manutenção; rodar todo dia reduz o impacto de uma falha pontual |
| **Captura incompleta** | Nenhum monitor é 100% — uma falha de portal pode deixar passar uma publicação | **No contrato:** posicionar como monitoramento auxiliar *best effort*, sem garantia de 100%, que não substitui a diligência do cliente. Nunca prometer captura total |
| **Aspecto legal da coleta** | Varrer portais públicos | Risco baixo: são **atos oficiais públicos**, dados abertos, sem burlar login. Ainda assim: respeitar limites de requisição e os termos dos portais |
| **LGPD** | Os e-mails dos destinatários são dados pessoais | Risco baixo: ter política de privacidade e consentimento no contrato. CNPJ e atos oficiais são públicos |
| **Entregabilidade** | E-mails caindo em spam | Domínio próprio autenticado (SPF/DKIM/DMARC, que o Resend configura); templates limpos |
| **Risco de pessoa-chave** | O negócio depende 100% de você | Hospedagem autônoma (Fase 4 + nuvem), tudo documentado; com receita, contratar ajuda |
| **Concentração de cliente** | Um cliente grande sendo fatia grande da receita | Diversificar a carteira; não deixar um cliente passar de ~20–25% do MRR |
| **Venda lenta** | B2B de compliance é baseado em confiança e demora | Preço de fundador + depoimentos + indicação; planejar pelo cenário conservador |
| **Concorrência** | Um player grande de monitoramento jurídico adicionar o vertical ambiental | Profundidade no nicho, velocidade e relacionamento — vantagens de quem é pequeno e focado |

---

## 13. Lean Canvas (uma página)

Resumo do modelo de negócio em um quadro — útil para revisitar e para explicar o
negócio a alguém em 2 minutos.

| Bloco | Conteúdo |
|---|---|
| **Problema** | Acompanhar manualmente DOU, IBAMA e diários estaduais é trabalhoso e falho; perder uma publicação (auto, embargo, prazo) custa caro |
| **Segmentos de cliente** | Consultorias/escritórios ambientais (foco); empresas com licenças (indústria, agro, mineração, energia); profissionais autônomos |
| **Proposta de valor única** | "Nada relevante sobre as suas empresas passa despercebido nos diários oficiais — e você sabe no mesmo dia, com a gravidade e o prazo já avaliados" |
| **Solução** | Robô que varre as fontes todo dia útil por CNPJ, deduplica e envia alerta classificado por cliente |
| **Canais** | Venda direta e indicação; consultorias satisfeitas como canal; conteúdo no LinkedIn sobre compliance ambiental |
| **Fontes de receita** | Assinatura mensal/anual em planos por nº de CNPJs (R$ 197 / R$ 497 / R$ 1.200 / sob medida) + taxa de setup |
| **Estrutura de custos** | Hospedagem, e-mail, domínio, formalização (MEI/ME), cobrança, contador, (opcional) IA. ~R$ 110–2.000/mês conforme a escala |
| **Métricas-chave** | Nº de clientes pagantes, MRR, churn, ticket médio, nº de CNPJs monitorados |
| **Vantagem injusta** | Foco e profundidade no nicho ambiental; interpretação por IA (a construir); relacionamento direto com as consultorias |

---

## 14. Próximos passos imediatos

O que fazer **agora**, na ordem, para sair da fase de desenvolvimento rumo aos
primeiros clientes:

1. **Concluir a Fase 4** (`FASE4_PROMPT.md`) — confiabilidade. Já está
   especificada.
2. **Registrar o domínio próprio** e configurar o e-mail autenticado no Resend.
3. **Subir para uma VPS na nuvem** — tirar a operação da sua máquina.
4. **Abrir o MEI** — CNPJ e nota fiscal.
5. **Escrever o contrato, os termos e a política de privacidade** — com a
   cláusula de "monitoramento auxiliar, sem garantia de 100%".
6. **Abrir conta de cobrança** (Asaas ou Cora).
7. **Listar 5–8 contatos da sua rede** que são consultorias ou empresas com
   licença — e convidar 2–3 para piloto a preço de fundador.
8. **Montar o material de venda** — uma página + um e-mail de alerta de exemplo.

Depois disso, o roteiro de produto da Fase 2 (seção 11) — começando por
**multi-estado** e pela **camada de interpretação por IA** — é o que transforma a
plataforma em algo difícil de o cliente abrir mão.

---

*Documento de planejamento — estimativas para apoiar decisão, não promessas.
Revisar conforme o produto e a realidade comercial evoluírem. Valores legais e
tributários citados são ordens de grandeza; confirme com profissionais de
direito e contabilidade.*
