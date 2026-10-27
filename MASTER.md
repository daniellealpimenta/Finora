# Finora: design system

Fonte única de verdade do visual do app. Toda cor, fonte, espaçamento, raio e animação do
frontend sai daqui. Os tokens vivem em `frontend/src/app/globals.css` (CSS) e
`frontend/src/lib/motion.ts` (GSAP); este arquivo explica o porquê de cada um.

## Teses (validadas em 2026-10-17, personalidade revista em 2026-10-26)

**Visual.** Um cofre calmo, com vida nos detalhes: base grafite-azulada no escuro e pedra fria no
claro, os dois tratados por igual e com botão para alternar. O latão (bronze no claro) é a única
cor de ação e da marca, inclusive no "R$" do número herói. A cor extra entra só em peças
pequenas: a cor de cada seção no ícone do menu, os selos de ícone coloridos nos índices e no
resumo, sete famílias de cor nas categorias e as palavras-chave tingidas na frase-resumo.
Superfícies grandes, fundos e cards nunca são coloridos. A tipografia usa duas famílias: a
Bricolage Grotesque dá voz aos números grandes e aos títulos, e a Manrope fica com todo o resto
(texto, rótulos, valores em lista). Algarismos sempre tabulares. O
espaçamento é arejado, em base 4px, com cards de 24px de respiro. Os componentes são preenchidos,
sem borda nem sombra, com raios de 8, 10 e 14px.

**Personalidade (2026-10-26).** O app é um cofrinho brasileiro que reage a você. A personalidade
mora em três lugares, e só neles:
- **O Pila vivo:** pisca, segue o ponteiro com os olhos e muda de humor com o que acontece.
- **Dinheiro como moeda e cédula:** o número herói rola como contador mecânico; moedas caem no
  cofrinho; a marca é uma moeda; o guilhoché das cédulas aparece atrás do número herói e no login.
- **O fechamento do ciclo:** uma vez por ciclo, o Pila conta como foi o ciclo que fechou.

**Interação.** Calmo na base, lúdico nos momentos. Hover, foco e clique ficam em CSS, entre 120 e
200ms, e só trocam o tom. Os momentos de personalidade são feitos em GSAP (`gsap` +
`@gsap/react`, sempre com `useGSAP`) e só acontecem quando algo muda de verdade:
- a entrada da página é orquestrada;
- o número herói rola como contador mecânico (`components/odometer.tsx`);
- o anel de saúde se desenha e o selo faz um pop com brilho;
- as barras enchem em cascata;
- trocar o mês desliza o painel;
- o ícone da categoria balança no hover;
- a moeda da marca dá um giro ao abrir e gira durante a sincronização;
- os avisos sobem com um leve `back.out`, alguns com o Pila no lugar do ícone.

Cada ação do usuário tem resposta:
- trocar a categoria vira o selo do ícone;
- sincronizar termina com o Pila contando o que chegou;
- orçamento estourado treme uma vez (`data-over`) e o Pila comenta;
- cofrinho que cresceu desde a última visita recebe uma moeda;
- no login, o Pila fecha os olhos enquanto a senha é digitada.

O overshoot fica só em peças com menos de 48px. Com "reduzir movimento" ligado, tudo aparece no
estado final.

**Proibido:** parallax, animação ligada ao scroll, elastic ou bounce em áreas grandes, loops
decorativos, blur ou vidro, escala no hover de cards, sombras coloridas e gradientes de marca.
A única exceção a "sem loop" é a piscada do Pila: curta (0,18s), rara (a cada 2,6 a 6s) e só
onde ele é o centro da tela (`alive`).

**Padrões permitidos:** linhas finas entre itens de lista, algarismos tabulares, frase-resumo com
palavras tingidas, selos de ícone coloridos, cor por seção no menu, forma e cor nos status
(● ▲ ■), brilho único no selo de status, contador mecânico no número herói, moeda girando ao
sincronizar, guilhoché (só no card do topo, no login e no fechamento) e chuva de moedas (só no
fechamento que fechou no azul).

Dials usados na consulta ao dataset: variance 4 ("preenchidos, sem borda nem sombra"), motion 6
("calmo na base, lúdico nos momentos"), density 4 ("arejado, 24px de respiro").

## Cor

Os tokens são definidos em `:root`, com o tema claro como padrão. O escuro é aplicado por
`@media (prefers-color-scheme: dark)` em `:root:not([data-theme="light"])` e por
`:root[data-theme="dark"]`. O botão de tema grava `data-theme` em `<html>` e no `localStorage`
(`mf_theme`).

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--background` | `#D3DAE2` | `#0D1115` | fundo da página |
| `--surface` | `#FFFFFF` | `#141A20` | cards, barra do menu, campos |
| `--surface-2` | `#E4E9EF` | `#1B232A` | trilhas, hover, item ativo neutro |
| `--border` | `#B4C0CC` | `#26303A` | linhas finas entre itens, contorno de campo |
| `--grid` | `#D6DDE4` | `#1F272F` | grade dos gráficos |
| `--foreground` | `#0A1016` | `#E6EBEF` | texto |
| `--muted` | `#3B4754` | `#8C99A5` | texto secundário, rótulos |
| `--accent` | `#8A5300` | `#D2AC6A` | latão: ação primária, marca, "R$" |
| `--accent-fg` | `#FFFFFF` | `#17120A` | texto sobre o latão |
| `--positive` | `#00745B` | `#4FCBA8` | bom, receitas |
| `--negative` | `#C1311A` | `#F2876B` | ruim, despesas |
| `--warning` | `#9A5000` | `#F0A848` | atenção |
| `--series-ref` | `#8A949E` | `#5E6A75` | série de referência (mês anterior) |
| `--card-edge` | `#B9C5D0` | transparente | contorno de 1px dos cards (só o claro precisa) |
| `--tint` | `22%` | `15%` | força do fundo tingido dos selos e pílulas |

Tema claro revisto de novo em 2026-10-27 (o usuário achou ruim de ver): fundo mais fundo para os
cards brancos se destacarem, linhas visíveis, texto suave mais escuro (9,5:1) e cores de detalhe
mais saturadas; o latão vira um âmbar mais vivo. A barra do topo é grafite nos dois temas
(`theme-dark` no `<header>`): âncora do layout e a moeda de latão brilhando nela.

Antes, em 2026-10-17 (estava lavado): card sobre o fundo passou de 1,1:1 para
1,28:1, linha sobre o card de 1,31:1 para 1,63:1, texto suave de 6,3:1 para 7,6:1.

Contraste sobre `--surface` (WCAG):
- **Claro:** texto 19,1:1, suave 9,5:1, latão 6,3:1, positivo 5,8:1, negativo 5,6:1, atenção 6,0:1;
  cores de detalhe entre 5,6:1 e 7,3:1 (todas acima de 4,7:1 sobre `--surface-2`).
- **Escuro:** texto 14,6:1, suave 6,0:1, latão 8,2:1, positivo 8,7:1, negativo 7,1:1, atenção 8,7:1.

Todos passam de 4,5:1 também sobre `--surface-2`.

### Cores de detalhe (só peças pequenas)

Uso permitido:
- ícones;
- selos de 26 a 36px;
- barras finas de até 8px;
- palavras marcadas;
- o tom do item ativo no menu.

Fora dessas peças, nunca aparecem como fundo de card.

O fundo tingido dos selos é sempre `color-mix(in oklab, <cor> var(--tint), transparent)`, sem token
próprio. Contraste da cor sobre o próprio selo tingido: no mínimo 4,6:1 no claro e 5,1:1 no
escuro, o que permite usá-la também como texto (palavras marcadas na frase-resumo).

| Token | Claro | Escuro | Família |
|---|---|---|---|
| `--cat-home` | `#1D5FD6` | `#6EA8FE` | Casa e contas |
| `--cat-food` | `#A34600` | `#F2A65A` | Comida |
| `--cat-move` | `#6436E0` | `#A78BFA` | Transporte |
| `--cat-care` | `#C01F6A` | `#F28AB5` | Saúde e bem-estar |
| `--cat-fun` | `#006B7C` | `#5BC8DB` | Lazer e assinaturas |
| `--cat-shop` | `#4A7300` | `#B5CF6B` | Compras e pets |
| `--cat-fin` | `#4A5868` | `#9AA7B4` | Tarifas, juros e Pix |

**Seções do menu:**

| Seção | Cor |
|---|---|
| Visão geral | `--accent` |
| Transações | `--cat-home` |
| Orçamentos | `--cat-move` |
| Cofrinhos | `--cat-care` (rosa, a cor do Pila) |
| Contas | `--cat-fun` |
| Desejos | `--cat-shop` |
| Assistente | `--cat-fin` (no celular, botão no topo; a barra inferior fica com 6) |

**Categorias** (chave do backend → família → ícone Lucide):

| Família | Categorias |
|---|---|
| home | `housing` Home · `utilities` Lightbulb · `telecom` Wifi |
| food | `groceries` ShoppingCart · `eating_out` UtensilsCrossed · `delivery` Bike |
| move | `transport` Bus · `ride_hailing` CarTaxiFront · `fuel` Fuel · `vehicle` Car · `travel` Plane |
| care | `health` Stethoscope · `pharmacy` Pill · `fitness` Dumbbell |
| fun | `leisure` Ticket · `subscriptions` Tv · `education` GraduationCap · `gambling` Dices |
| shop | `shopping` ShoppingBag · `pets` PawPrint · `donations` HandHeart |
| fin | `taxes_fees` Receipt · `debt` Percent · `insurance` ShieldCheck · `transfers_out` Send · `other` CircleDashed |
| receitas (`--positive`) | `salary` BriefcaseBusiness · `extra_income` Sparkles · `investment_income` TrendingUp · `transfers_in` ArrowDownLeft · `other_income` CirclePlus |
| movimentações (`--muted`) | `own_transfer` ArrowLeftRight · `card_payment` CreditCard · `investments` PiggyBank |
| sem categoria (`--muted`) | Tag |

### Gráficos

| Gráfico | Séries |
|---|---|
| Receitas e despesas | `--positive` e `--negative`. O mês selecionado fica com opacidade 1 e os demais com 0,55. |
| Ritmo de gastos | este mês em `--accent` (2px); mês anterior em `--series-ref`, tracejado |
| Compromissos futuros | `--cat-move` |

A grade usa `--grid`, os eixos usam `--muted` em 12px, e todo gráfico tem uma alternativa em
tabela.

## Mascote: Pila (redesenhado em 2026-10-26)

O porquinho: o "cofrinho" que o usuário já usa no dia a dia. De frente, formas chapadas e sem
contorno, cabeça grande, olhos com brilho e a boca embaixo do focinho, para a expressão ler bem
até em 28px. Componente `frontend/src/components/pila.tsx`, com expressões ligadas a estados reais:

| Expressão | Quando |
|---|---|
| `happy` | mês fechou no azul, meta de cofrinho batida, nada parcelado, login |
| `neutral` | estado normal, entrando |
| `worried` | orçamento estourado, mês no vermelho, senha errada |
| `sleep` | sem dados ainda (sem transações, sem cofrinhos) |
| `shy` | olhos fechados e bochecha corada: senha sendo digitada no login |
| `celebrate` | boca aberta e brilhos de moeda: sync trouxe novidade, cofrinho cresceu, fechamento no azul |

**Outros mascotes (2026-10-27).** No Perfil o usuário troca o Pila por **Casco**, o tatu, ou
**Guará**, o lobo-guará. A escolha fica no banco (`AppSetting` "mascot") e vale para o app todo:
todo texto que cita o mascote usa o nome escolhido (`useMascot().name`), inclusive o assistente,
que se apresenta com ele. Os três dividem a grade de 120, os humores e as regras abaixo. Muda só o
corpo e onde ficam olhos, boca, "Zz" e gota (`FACES` em `pila.tsx`).
- Casco: tatu à moda do Fuleco, com casco de faixas por cima da cabeça como um capacete, orelhas
  pontudas saindo dele e focinho comprido entre os olhos, com o nariz na ponta e uma boca só
  embaixo. Casco `#8B7A66` com faixas `#A5937C`, corpo `#7D6C59`, rosto `#E2C9A4`, focinho
  `#F0DCC0`, orelhas `#C4A37F`/`#E7B39C`, olhos e boca `#2A1F16`.
- Guará: orelhas grandes, pelagem `#D9772F`, focinho `#F7E6CC`, "capa" do pescoço e patas
  `#2B2420`, parte de dentro das orelhas `#F6DCB8`, olhos e boca `#24160D`.

Regras:
- Aparece só quando há algo a dizer: login, estados vazios, conquistas e o balão do topo da
  Visão geral. Nunca em todo card.
- Fala em balão curto, na voz do app: direto, sem jargão, sem inventar número.
- Cores próprias, iguais nos dois temas (é ilustração): `--pila-body #F28AB5`,
  `--pila-light #F9B6D2` (focinho e brilho), `--pila-ear #E06F9F` (orelhas e patas),
  `--pila-blush #E0567F`, `--pila-line #8F2F5A` (fenda e narinas), `--pila-ink #3A1426` (olhos e
  boca), moeda `--coin #D2AC6A` / `--coin-line #6B5221`.
- Movimento: entra subindo 8px com fade (0,45s `power3.out`). Com `coin`, uma moeda cai pela
  fenda uma vez (0,5s `power2.in`). `celebrate` dá um pulinho (`back.out(3)`).
- `alive` (login, fechamento): pisca e segue o ponteiro com os olhos (até 3px). Só onde ele é o
  centro da tela, nunca em toast ou balão de card.
- Também aparece nos avisos (toast) de 28px, no lugar do ícone, quando o aviso tem humor.
- Botão do assistente (`components/assistant/fab.tsx`): o Pila de 40px num botão redondo de 56px
  no canto inferior direito, em todas as páginas menos a aba Assistente. Abre a conversa num
  painel (no celular, quase a tela toda, acima da barra de seções). Por flutuar sobre o conteúdo,
  usa a borda `--card-edge` dos diálogos, sem sombra. Os avisos (toasts) sobem para acima dele.

## Painel personalizável

A Visão geral é um catálogo de 12 cards (`components/dashboard/panel.tsx`) numa grade de 6
colunas: inteiro, metade ou um terço; no celular, uma coluna. "Personalizar" liga e desliga
cards, reordena (arrastar, ou setas para quem usa teclado) e restaura o padrão. A escolha fica
no `localStorage` (`mf_painel_v1`): é preferência de quem usa, não dado financeiro.

O topo usa regime de caixa no mês atual ("Em conta agora": saldo das contas correntes) e
resultado do mês (receitas menos despesas) nos meses fechados.

Cofrinhos: o Open Finance não manda o nome que o usuário deu a cada cofrinho, e cada depósito
chega como uma aplicação separada (no PicPay, um CDB por depósito, todos com o mesmo nome). O
sync sugere um cofrinho por emissor + produto + taxa ("PicPay CDB 110% do CDI"); o usuário
renomeia, move aplicações e define metas em `/cofrinhos`. Depósitos novos com a mesma taxa caem
no cofrinho sugerido, mesmo renomeado.

`.theme-dark` aplica os tokens escuros a um trecho só, nos dois temas (painel da marca no login).

## Tipografia

**Fontes** (Google Fonts via `next/font/google`, servidas localmente a partir do build):
- **Bricolage Grotesque** (`font-display`): números grandes, títulos de página, nome do app e
  títulos do fechamento. Números em 400, títulos em 700.
- **Manrope** (`font-sans`, padrão): todo o resto.

O fallback é `"Segoe UI", system-ui, -apple-system, sans-serif`, com o ajuste de métrica
automático do `next/font`. As duas têm `tnum`.

| Papel | Tamanho / peso | Notas |
|---|---|---|
| Herói | `clamp(40px, 7vw, 60px)` / Bricolage 400 | tracking −0.03em, tabular, contador mecânico. "R$" em 0.42em/600 na cor `--accent`; centavos em 0.45em na cor `--muted`, alinhados ao topo como etiqueta de preço |
| Índice | 28px / Bricolage 400 | tracking −0.02em; unidade em 14px/500 na cor `--muted` |
| Título da página | 28px / Bricolage 700 | tracking −0.02em |
| Título de card | 15px / 600 | |
| Corpo | 15px / 400 | line-height 1.55; frase-resumo em 16px |
| Valor em lista | 15px / 500 | tabular |
| Rótulo | 12px / 500 | `--muted`, em caixa normal ("Livre agora"), nunca em maiúsculas espaçadas |
| Nota / ajuda | 13px / 400 | `--muted`, line-height 1.5 |

Nenhum texto abaixo de 12px (a única exceção é o rótulo da barra inferior no celular, 10,5px,
por caber 6 abas). Card com ícone tem título de card (15px/600), inclusive os índices; rótulo
só acima de um número, nunca como título.

Saída de dinheiro leva "−" (`outflow()` em `lib/format.ts`), mas zero fica sem sinal: "R$ 0,00".

Todo valor monetário usa `tabular-nums`, e as frases ficam com no máximo ~65 caracteres por
linha.

## Espaço, raios, camadas

- **Espaço:** base 4px. Escala usada: 4, 8, 12, 16, 24, 32, 48. O padding de card é 24px (20px
  abaixo de 640px), o espaço entre cards é 16px e o espaço entre seções é 32px.
- **Raios:**

  | Token | Valor | Uso |
  |---|---|---|
  | `--radius-chip` (`--r-chip`) | 8px | selo de ícone |
  | `--radius-control` (`--r-control`) | 10px | botões, campos |
  | `--radius-card` (`--r-card`) | 14px | cards, diálogos |
  | `full` | 999px | só pílulas e barras |

- **Sombras:** nenhuma. A hierarquia vem do tom da superfície. A única exceção é o diálogo, que
  usa um véu `rgb(0 0 0 / 0.45)` atrás.
- **Z-index:** menu 30, barra inferior (mobile) 30, diálogo 50, aviso (toast) 60.
- **Toque:** área clicável mínima de 40px no desktop e 44px no mobile.

## Componentes

| Componente | Especificação |
|---|---|
| **Button** | 40px de altura, `--radius-control`, 14px/600 |
| **IconButton** | 36px (desktop) ou 44px (mobile), com `aria-label` obrigatório |
| **Input / Select** | `--surface`, borda `--border`; foco com borda `--accent` e anel de 3px em `--accent` a 25% |
| **Conta (EqRow)** | conta de dinheiro mostrada inteira, linha a linha: coluna de operação (`+ − = ÷`) em Bricolage 700 `--muted`, rótulo com a origem embaixo (12px), valor tabular à direita. Toda parcela aparece, mesmo valendo zero ("todas já caíram"); linhas `=` em 600 com linha `--border` em cima. Usada na Previsão do ciclo |
| **Select em lista** | controle repetido em cada linha (categoria da transação): `--surface-2`, sem contorno; a borda `--border` só aparece no hover e o foco é igual ao do Input |
| **Salvar em lista** | some (`invisible`, guarda o lugar) até a linha ter mudança; Enter também salva |
| **Card** | `--surface`, `--radius-card`, padding 24px, sem borda |
| **Pill de status** | fundo da cor a 15%, texto na cor e forma ● (ok), ▲ (atenção) ou ■ (ruim). A forma sempre acompanha a cor |
| **CategoryIcon** | 36px (lista) ou 28px (compacto), `--radius-chip`, fundo tingido e ícone Lucide na cor da família |
| **Meter** | trilha `--surface-2` de 8px, preenchimento na cor semântica, escala embaixo nomeando a meta |
| **Toast** | fundo `--foreground`, texto `--background`, canto inferior direito, some em 3s |
| **Nav** | barra superior em `--surface` com linha `--border` embaixo. O item ativo tem fundo da cor da seção a 13%; o ícone fica sempre na cor da seção. Abaixo de 640px, as quatro seções viram uma barra inferior fixa |

Estados de cada componente:

| Componente | Padrão | Hover | Foco | Pressionado | Desativado |
|---|---|---|---|---|---|
| **Button primary** | `--accent` | 88% accent + 12% foreground | contorno 2px `--accent`, offset 2px | 78% accent | opacidade 0.45, `not-allowed` |
| **Button secondary** | `--surface-2` | 85% surface-2 + foreground | igual | 75% | igual |
| **Button ghost** | transparente, `--muted` | `--surface-2` e `--foreground` | igual | | |
| **Button danger** | ghost com texto `--negative` | | | | |

## Movimento

Os tokens CSS (`globals.css`) cuidam de hover, foco, tema e campos. Os tokens GSAP
(`lib/motion.ts`) cuidam dos momentos.

| Token | Valor | Uso |
|---|---|---|
| `--dur-fast` | 120ms | hover, press |
| `--dur-base` | 200ms | tema, campos, item de menu |
| `--ease-out` | `cubic-bezier(0.2, 0, 0, 1)` | todas as transições CSS |

| Momento (GSAP) | Duração | Ease | Detalhe |
|---|---|---|---|
| Entrada da página | 0.5s | `power3.out` | y 12 → 0, autoAlpha, stagger 0.06 |
| Contador do herói (CSS) | 0.9s | `cubic-bezier(0.2, 0.9, 0.1, 1)` | cada dígito rola do anterior (ou 0) ao novo, cascata de 45ms |
| Anel de saúde | 1.0s | `power2.out` | `stroke-dashoffset` |
| Selo de status | 0.4s | `back.out(2)` | scale 0.6 → 1; brilho em 0.7s `power2.inOut`, uma vez |
| Barras (meter e categorias) | 0.6s | `power3.out` | scaleX 0 → v, stagger 0.05 |
| Barras do gráfico | 0.5s | `power3.out` | scaleY, stagger 0.025 |
| Troca de mês | saída 0.16s `power2.in`, entrada 0.36s `power3.out` | | ±24px na direção da seta |
| Ícone de categoria (hover) | 0.45s | | rotação [0, −12, 9, −4, 0] e scale 1.1 com `back.out(2)` |
| Moeda da marca (abrir) | 0.9s | `power3.inOut` | um giro (rotationY 360°) |
| Moeda da marca (sync) | 1.2s por volta | linear | repete até o sync terminar |
| Troca de categoria | 0.45s | `back.out(2)` | o selo vira (rotationY −90° → 0, scale 0.8 → 1) |
| Passou do limite | 0.45s | | x [0, −5, 5, −3, 3, 0] uma vez, depois que as barras enchem |
| Moeda no cofrinho | 0.6s | `power2.in` | cai 60px girando no saldo, que pulsa 1.08 |
| Piscada do Pila | 0.18s | `power1.inOut` | scaleY 1 → 0.1 → 1, a cada 2,6 a 6s |
| Fechamento: tela | 0.4s | `power3.out` | y 16 → 0; no azul, 18 moedas caem (1,1 a 1,8s) |
| Toast | entrada 0.4s `back.out(1.6)`, saída 0.2s `power2.in` | | y 24 → 0 |
| Ícone de tema | 0.4s | `back.out(1.4)` | rotação −180 → 0 |
| Diálogo | entrada 0.24s `power3.out`, saída 0.15s `power2.in` | | scale 0.96 → 1, autoAlpha; véu em autoAlpha |

**Reduzir movimento:** toda animação GSAP passa por `gsap.matchMedia()` com
`(prefers-reduced-motion: reduce)`. Nesse modo, os elementos vão direto ao estado final (`set`).
O CSS zera as transições no mesmo media query.

Animar só `transform`, `opacity`/`autoAlpha` e atributos de SVG. Nunca `width`, `height`, `top`
ou `left`.

## Marca e ícone

A moeda-focinho: moeda de latão com o focinho do porquinho, num quadrado grafite de cantos 15/64.
Lê em 16px e diz "cofrinho" sem precisar do porco inteiro.
- `frontend/src/app/icon.svg`: navegador.
- `frontend/src/app/favicon.ico` (16 a 256px): navegador e ícone do .exe.
- `CoinMark` em `components/chrome.tsx`: topo do app e login, só a moeda, sem o quadrado.

## Assinatura: guilhoché e fechamento

- **Guilhoché** (`components/guilloche.tsx`): o padrão de linhas gravadas das cédulas, desenhado
  em canvas na cor `--accent` a 16%. Estático. Só atrás do número herói, no painel do login e no
  fechamento.
- **Fechamento do ciclo** (`components/recap.tsx`): na primeira visita depois que o ciclo fecha,
  abre sozinho com 5 telas curtas (abertura, entrou, saiu e maior gasto, cofrinhos, resultado).
  Dá para pular (Esc, X) e rever pelo botão "Fechamento de …" na Visão geral. O ciclo visto fica
  em `localStorage` (`mf_recap_seen`).

## Som

Ligado por padrão (desde 2026-10-27); o botão no topo (som de moeda) desliga. Um "tlim"
sintetizado (`lib/sound.ts`, duas notas senoidais de 0,35s) só quando dinheiro entra: sync com
novidade, cofrinho que cresceu, fechamento no azul. Escolha em `localStorage` (`mf_sound`).

## Texto

Escrever em pt-BR, no tom de quem fala com você sobre o seu dinheiro: direto, sem jargão de
banco e sem travessão. Cada índice traz uma linha que diz o que ele significa. Os números da
frase-resumo vêm da API; nada é inventado.
