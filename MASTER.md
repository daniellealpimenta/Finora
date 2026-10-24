# ManagerFinance: design system

Fonte única de verdade do visual do app. Toda cor, fonte, espaçamento, raio e animação do
frontend sai daqui. Os tokens vivem em `frontend/src/app/globals.css` (CSS) e
`frontend/src/lib/motion.ts` (GSAP); este arquivo explica o porquê de cada um.

## Teses (validadas em 2026-10-17)

**Visual.** Um cofre calmo, com vida nos detalhes: base grafite-azulada no escuro e pedra fria no
claro, os dois tratados por igual e com botão para alternar. O latão (bronze no claro) é a única
cor de ação e da marca, inclusive no "R$" do número herói. A cor extra entra só em peças
pequenas: a cor de cada seção no ícone do menu, os selos de ícone coloridos nos índices e no
resumo, sete famílias de cor nas categorias e as palavras-chave tingidas na frase-resumo.
Superfícies grandes, fundos e cards nunca são coloridos. A tipografia usa uma família só, a
Manrope: números grandes em peso leve (300), algarismos tabulares e rótulos em peso médio. O
espaçamento é arejado, em base 4px, com cards de 24px de respiro. Os componentes são preenchidos,
sem borda nem sombra, com raios de 8, 10 e 14px.

**Interação.** Calmo na base, lúdico nos momentos. Hover, foco e clique ficam em CSS, entre 120 e
200ms, e só trocam o tom. Os momentos de personalidade são feitos em GSAP (`gsap` +
`@gsap/react`, sempre com `useGSAP`) e só acontecem quando algo muda de verdade:
- a entrada da página é orquestrada;
- o número herói conta até o valor;
- o anel de saúde se desenha e o selo faz um pop com brilho;
- as barras enchem em cascata;
- trocar o mês desliza o painel;
- o ícone da categoria balança no hover;
- o disco do cofre gira ao abrir e durante a sincronização;
- os avisos sobem com um leve `back.out`.

O overshoot fica só em peças com menos de 48px. Com "reduzir movimento" ligado, tudo aparece no
estado final.

**Proibido:** parallax, animação ligada ao scroll, elastic ou bounce em áreas grandes, loops
decorativos, blur ou vidro, escala no hover de cards, sombras coloridas e gradientes de marca.

**Padrões permitidos:** linhas finas entre itens de lista, algarismos tabulares, frase-resumo com
palavras tingidas, selos de ícone coloridos, cor por seção no menu, forma e cor nos status
(● ▲ ■), brilho único no selo de status, contagem do número herói e o disco do cofre girando ao
sincronizar.

Dials usados na consulta ao dataset: variance 4 ("preenchidos, sem borda nem sombra"), motion 6
("calmo na base, lúdico nos momentos"), density 4 ("arejado, 24px de respiro").

## Cor

Os tokens são definidos em `:root`, com o tema claro como padrão. O escuro é aplicado por
`@media (prefers-color-scheme: dark)` em `:root:not([data-theme="light"])` e por
`:root[data-theme="dark"]`. O botão de tema grava `data-theme` em `<html>` e no `localStorage`
(`mf_theme`).

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--background` | `#DFE4E9` | `#0D1115` | fundo da página |
| `--surface` | `#FFFFFF` | `#141A20` | cards, barra do menu, campos |
| `--surface-2` | `#E6EBEF` | `#1B232A` | trilhas, hover, item ativo neutro |
| `--border` | `#C3CCD4` | `#26303A` | linhas finas entre itens, contorno de campo |
| `--grid` | `#DCE2E7` | `#1F272F` | grade dos gráficos |
| `--foreground` | `#0E141A` | `#E6EBEF` | texto |
| `--muted` | `#4A5560` | `#8C99A5` | texto secundário, rótulos |
| `--accent` | `#7A5718` | `#D2AC6A` | latão: ação primária, marca, "R$" |
| `--accent-fg` | `#FFFFFF` | `#17120A` | texto sobre o latão |
| `--positive` | `#0A7360` | `#4FCBA8` | bom, receitas |
| `--negative` | `#B53B23` | `#F2876B` | ruim, despesas |
| `--warning` | `#935004` | `#F0A848` | atenção |
| `--series-ref` | `#8A949E` | `#5E6A75` | série de referência (mês anterior) |
| `--card-edge` | `#CFD7DE` | transparente | contorno de 1px dos cards (só o claro precisa) |
| `--tint` | `20%` | `15%` | força do fundo tingido dos selos e pílulas |

Tema claro revisado em 2026-10-17 (estava lavado): card sobre o fundo passou de 1,1:1 para
1,28:1, linha sobre o card de 1,31:1 para 1,63:1, texto suave de 6,3:1 para 7,6:1.

Contraste sobre `--surface` (WCAG):
- **Claro:** texto 18,5:1, suave 7,6:1, latão 6,6:1, positivo 5,8:1, negativo 5,8:1, atenção 5,7:1.
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
| `--cat-home` | `#2C65B8` | `#6EA8FE` | Casa e contas |
| `--cat-food` | `#9B5417` | `#F2A65A` | Comida |
| `--cat-move` | `#6D4FC9` | `#A78BFA` | Transporte |
| `--cat-care` | `#AD396C` | `#F28AB5` | Saúde e bem-estar |
| `--cat-fun` | `#197080` | `#5BC8DB` | Lazer e assinaturas |
| `--cat-shop` | `#556E10` | `#B5CF6B` | Compras e pets |
| `--cat-fin` | `#5A6773` | `#9AA7B4` | Tarifas, juros e Pix |

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

## Mascote: Pila (aprovado em 2026-10-17)

O porquinho de latão: o "cofrinho" que o usuário já usa no dia a dia. Componente
`frontend/src/components/pila.tsx`, com quatro expressões ligadas a estados reais:

| Expressão | Quando |
|---|---|
| `happy` | mês fechou no azul, meta de cofrinho batida, nada parcelado, login |
| `neutral` | estado normal, entrando |
| `worried` | orçamento estourado, mês no vermelho, senha errada |
| `sleep` | sem dados ainda (sem transações, sem cofrinhos) |

Regras:
- Aparece só quando há algo a dizer: login, estados vazios, conquistas e o balão do topo da
  Visão geral. Nunca em todo card.
- Fala em balão curto, na voz do app: direto, sem jargão, sem inventar número.
- Cores próprias, iguais nos dois temas (é ilustração): `--pila-body #F28AB5`,
  `--pila-light #F7A8C9`, `--pila-ear #E06F9F`, `--pila-leg #C9618F`, `--pila-line #8F2F5A`,
  `--pila-ink #3A1426`, moeda `--coin #D2AC6A` / `--coin-line #6B5221`.
- Movimento: entra subindo 8px com fade (0,45s `power3.out`). Com `coin`, uma moeda cai pela
  fenda uma vez (0,5s `power2.in`). Sem loop, sem overshoot (ele tem mais de 48px).
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

**Fonte:** Manrope (Google Fonts, carregada via `next/font/google`, servida localmente a partir
do build). O fallback é `"Segoe UI", system-ui, -apple-system, sans-serif`, com o ajuste de
métrica automático do `next/font`. A tabela `tnum` está presente no arquivo da fonte.

| Papel | Tamanho / peso | Notas |
|---|---|---|
| Herói | `clamp(40px, 7vw, 60px)` / 300 | tracking −0.03em, line-height 1.05, tabular. "R$" em 0.42em/600 na cor `--accent`; centavos em 0.45em/400 na cor `--muted` |
| Índice | 28px / 300 | tracking −0.02em; unidade em 14px/500 na cor `--muted` |
| Título da página | 24px / 600 | tracking −0.02em |
| Título de card | 15px / 600 | |
| Corpo | 15px / 400 | line-height 1.55; frase-resumo em 16px |
| Valor em lista | 15px / 500 | tabular |
| Rótulo | 12px / 500 | `--muted`; quando está em maiúsculas, tracking 0.04em |
| Nota / ajuda | 13px / 400 | `--muted`, line-height 1.5 |

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
| Contagem do herói | 0.9s | `power2.out` | do valor anterior (ou 0) ao novo |
| Anel de saúde | 1.0s | `power2.out` | `stroke-dashoffset` |
| Selo de status | 0.4s | `back.out(2)` | scale 0.6 → 1; brilho em 0.7s `power2.inOut`, uma vez |
| Barras (meter e categorias) | 0.6s | `power3.out` | scaleX 0 → v, stagger 0.05 |
| Barras do gráfico | 0.5s | `power3.out` | scaleY, stagger 0.025 |
| Troca de mês | saída 0.16s `power2.in`, entrada 0.36s `power3.out` | | ±24px na direção da seta |
| Ícone de categoria (hover) | 0.45s | | rotação [0, −12, 9, −4, 0] e scale 1.1 com `back.out(2)` |
| Disco do cofre (abrir) | 0.9s | `power3.inOut` | −120° e volta |
| Disco do cofre (sync) | 1.2s por volta | linear | repete até o sync terminar |
| Toast | entrada 0.4s `back.out(1.6)`, saída 0.2s `power2.in` | | y 24 → 0 |
| Ícone de tema | 0.4s | `back.out(1.4)` | rotação −180 → 0 |
| Diálogo | entrada 0.24s `power3.out`, saída 0.15s `power2.in` | | scale 0.96 → 1, autoAlpha; véu em autoAlpha |

**Reduzir movimento:** toda animação GSAP passa por `gsap.matchMedia()` com
`(prefers-reduced-motion: reduce)`. Nesse modo, os elementos vão direto ao estado final (`set`).
O CSS zera as transições no mesmo media query.

Animar só `transform`, `opacity`/`autoAlpha` e atributos de SVG. Nunca `width`, `height`, `top`
ou `left`.

## Texto

Escrever em pt-BR, no tom de quem fala com você sobre o seu dinheiro: direto, sem jargão de
banco e sem travessão. Cada índice traz uma linha que diz o que ele significa. Os números da
frase-resumo vêm da API; nada é inventado.
