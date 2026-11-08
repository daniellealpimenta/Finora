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

**Mais movimento (2026-10-30).** Depois dos três conceitos de redesenho (Cofre, Fluxo e Pila),
o app ficou mais brincalhão: pílula elástica no menu, botões que afundam no clique, diálogos que
entram com `back.out`, e momentos novos que vieram dos conceitos:
- **Cofre no login:** depois de entrar, a porta do cofre gira o segredo, recolhe os ferrolhos e
  abre em 3D antes de liberar o app (`components/vault.tsx`). Também no fim do onboarding.
- **Fechamento em tela cheia:** abre num círculo, títulos sobem letra a letra (SplitText), valores
  contam do zero, chuva de moedas no azul (`components/recap.tsx`).
- **Jogo "Precisava ou foi vontade?":** cartas arrastáveis (Draggable) com carimbo, que voam para o
  cesto (`components/needs/`). Alimenta o card "Precisava × vontade".
- **Pote do desejo:** moedas voam em arco (MotionPath) e empilham no pote até a meta; na meta,
  confete (`components/wish-jar.tsx`).
- **Cards extras do Fluxo:** rio do dinheiro com partículas, régua do ciclo arrastável e categorias
  que se abrem com Flip (`components/dashboard/extras.tsx`). Começam desligados.

**Ainda proibido:** parallax, blur ou vidro e sombras coloridas. Degradê só em três lugares
(opção Doca, 2026-11-07): dois brilhos fixos e bem fracos no fundo da página (latão no alto,
violeta `--accent-2` embaixo), o brilho atrás do número da Conta do ciclo e a área do Ritmo de
gastos (latão → violeta). Cards continuam lisos. Elastic e bounce valem em peças pequenas e nos momentos acima (cartas, moedas, pote,
atalhos da Visão geral, ícones da doca), nunca no card inteiro do painel. Loops só onde dão informação: a piscada do Pila
(`alive`) e as partículas do rio, que mostram o dinheiro correndo.

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
| `--background` | `#EEF1F5` | `#0D1115` | fundo da página |
| `--surface` | `#FFFFFF` | `#141A20` | cards, barra do menu, campos |
| `--surface-2` | `#F1F4F8` | `#1B232A` | trilhas, hover, item ativo neutro |
| `--border` | `#D9DFE7` | `#26303A` | linhas finas entre itens, contorno de campo |
| `--grid` | `#E7EBF0` | `#1F272F` | grade dos gráficos |
| `--foreground` | `#111827` | `#E6EBEF` | texto |
| `--muted` | `#4B5563` | `#8C99A5` | texto secundário, rótulos |
| `--accent` | `#8A5300` | `#D2AC6A` | latão: ação primária, marca, "R$" |
| `--accent-fg` | `#FFFFFF` | `#17120A` | texto sobre o latão |
| `--positive` | `#00745B` | `#4FCBA8` | bom, receitas |
| `--negative` | `#C1311A` | `#F2876B` | ruim, despesas |
| `--warning` | `#9A5000` | `#F0A848` | atenção |
| `--series-ref` | `#8A949E` | `#5E6A75` | série de referência (mês anterior) |
| `--card-edge` | `#E1E6ED` | transparente | contorno de 1px dos cards (só o claro precisa) |
| `--tint` | `22%` | `15%` | força do fundo tingido dos selos e pílulas |

Tema claro refeito em 2026-11-07 (o cinza-azulado `#D3DAE2` do fundo ficou pesado e feio): fundo
quase branco e frio, cards brancos com contorno suave e linhas leves. Contraste sobre o card:
texto 17,7:1, suave 7,6:1, latão 6,3:1, positivo 5,8:1, negativo 5,6:1, atenção 6,0:1 (todos
acima de 4,9:1 também sobre o fundo e sobre `--surface-2`).

Antes, em 2026-10-27 (o usuário achou ruim de ver): fundo mais fundo para os
cards brancos se destacarem, linhas visíveis, texto suave mais escuro (9,5:1) e cores de detalhe
mais saturadas; o latão vira um âmbar mais vivo. (A barra grafite do topo saiu em 2026-11-06,
com a casca "Doca"; ver "Casca do app".)

Antes, em 2026-10-17 (estava lavado): card sobre o fundo passou de 1,1:1 para
1,28:1, linha sobre o card de 1,31:1 para 1,63:1, texto suave de 6,3:1 para 7,6:1.

Contraste sobre `--surface` (WCAG):
- **Claro:** texto 17,7:1, suave 7,6:1, latão 6,3:1, positivo 5,8:1, negativo 5,6:1, atenção 6,0:1.
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
| Assistente | `--cat-fin` (no celular, botão no topo) |

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

## Casca do app (opção "Doca", 2026-11-06)

Nada fica preso no topo. Escolhida entre três opções (Trilho, Doca e Comando) com espaçamento
normal, cantos suaves e movimento completo:
- **Marca e avatar** numa linha que rola com a página (`app/(app)/layout.tsx`): a moeda e
  "Finora" à esquerda, o botão "Buscar ou ir para… ⌘K" e o avatar à direita.
- **Seções** na doca embaixo (desktop) ou na barra flutuante (celular).
- **Sincronizar, tema, sons, perfil e sair** no menu do avatar e no ⌘K. A moeda da marca
  continua girando durante o sync, de qualquer tela (`lib/sync.ts`).
- **Atalhos** em pastel no topo da Visão geral, acima das zonas.

## Painel personalizável

A Visão geral é um catálogo de 19 cards (`components/dashboard/panel.tsx`) em **três zonas
fixas** (revisão de design de 2026-11-06, Gestalt: proximidade):

| Zona | Pergunta | Cards |
|---|---|---|
| **Agora** | o que está na mão | Conta do ciclo, Previsão, Cofrinhos, Cartões, Reserva |
| **Este ciclo** | como está indo | Para onde foi, Precisava × vontade, Saúde, Ritmo, Receitas e despesas, Onde mais gastou, Rio, Régua, Ladrilhos |
| **Depois** | o que já está combinado | Faturas, Compromissos, Parcelas, Gastos fixos, Assinaturas |

O título da zona (Bricolage 20px/700 e a pergunta em `--muted`) agrupa sem caixa a mais, com 32px
entre zonas. Zona sem card ligado some. Cada zona tem a sua grade de 6 colunas: inteiro, metade
ou um terço; no celular, uma coluna.

**Montagem livre (2026-11-07).** Em "Personalizar o painel", cada card ligado ganha uma barra com:
arrastar (para qualquer lugar, inclusive outra zona: soltar sobre um card põe no lugar dele,
soltar na zona põe no fim dela; montando, zonas vazias mostram "Solte um card aqui"), − e + para a largura (⅓, ½, ⅔ ou inteiro), altura
dupla (o card ocupa duas linhas e os vizinhos empilham ao lado, montando colunas; a grade usa
`grid-flow-row-dense`), mover para antes ou depois (teclado; atravessa zonas) e tirar. Largura escolhida é respeitada;
só a padrão estica, para a direita, enquanto houver espaço vazio na linha (`packRows` simula o
posicionamento dense do CSS, contando os cards de altura dupla). Toda mudança anima com
Flip (0,5s `power3.inOut`). O selo "Novo" nos cards novos some quando a pessoa liga o card pela
primeira vez (`tried`).

**Visualizações.** Os cards com dados em série trocam de visualização por botões no título
(`components/dashboard/views.tsx`), e a escolha fica salva no painel:

| Card | Visualizações |
|---|---|
| Receitas e despesas | barras, linha, tabela |
| Para onde foi o dinheiro | rosca, lista, tabela |
| Ritmo de gastos | linha, tabela |
| Compromissos futuros | barras, tabela |
| Onde você mais gastou | lista, rosca |
| Assinaturas e gastos fixos | lista, tabela |
| Cofrinhos | anéis de meta, lista |

A primeira opção é a inicial: "Para onde foi" abre na rosca e Cofrinhos nos anéis.

**Últimas transações** (`dashboard/recent.tsx`, card novo): as 6 mais recentes em linha do
tempo, com data, ponto na cor da categoria ligado por linha fina e valor (entrada em verde).

A rosca mostra o total no meio (centavos apagados); passar o mouse numa fatia mostra o valor dela
e apaga as outras; fatias abaixo de 3% viram "Outros".

**Onde fica salvo.** No app (`AppSetting` "panel", `GET`/`PUT /panel`), com cópia no
localStorage. Antes ficava só no localStorage, e o programa, com o pywebview em modo privado,
apagava tudo ao fechar; agora a janela abre com `private_mode=False` e guarda o armazenamento em
`<pasta de dados>/webview` (vale também para tema, som e fechamento visto).

**Padrão (2026-11-07)**: a montagem que o Daniel salvou como ideal.

| Zona | Cards |
|---|---|
| Agora | Conta do ciclo e Previsão (inteiros) |
| Este ciclo | Saúde e Reserva; Rio do dinheiro; Ritmo e Receitas e despesas; Ladrilhos; Faturas e Cartões; Para onde foi, Gastos fixos e Cofrinhos; Parcelas e Onde mais gastou; Régua |
| Depois | Assinaturas e Precisava × vontade |

Compromissos futuros e Últimas transações ficam no catálogo. "Voltar ao padrão" está nos três
pontinhos ao lado do seletor de ciclo e no catálogo; volta a montagem e mantém as visualizações
escolhidas e os selos já vistos.

**Três pontinhos** (`dashboard/panel-menu.tsx`), ao lado do seletor de ciclo: Personalizar o
painel (ou Concluir), Voltar ao padrão e Rever o fechamento. O catálogo abre no topo do painel.

**Avisos do topo fecham** (X): a faixa do fechamento e a de banco parado. Fechar vale para aquele
assunto (`lib/dismiss.ts`): outro ciclo fechado ou outro banco parado traz o aviso de volta.

No topo da Visão geral fica só o seletor de ciclo. O fechamento pronto vira uma faixa tingida de
latão ("O fechamento de outubro está pronto · Ver"), acima das zonas.

**Banco parado** (`components/stale-note.tsx`, `lib/stale.ts`): quando a transação mais recente
de um banco tem mais de 10 dias, uma faixa em `--warning` avisa ("Nubank sem transações novas
desde 10/10") e manda para Contas, onde a conta mostra "▲ Sem transações novas desde …". Pelo
MeuPluggy, sincronizar não traz nada se o banco parou de mandar dados, e sem o aviso o painel
mostra dados velhos como se estivessem em dia. 10 dias para conta pouco usada não virar alarme.

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

Nenhum texto abaixo de 12px, inclusive o rótulo da barra inferior no celular. Card com ícone tem título de card (15px/600), inclusive os índices; rótulo
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
  | `--radius-chip` (`--r-chip`) | 10px | selo de ícone |
  | `--radius-control` (`--r-control`) | 12px | botões, campos |
  | `--radius-card` (`--r-card`) | 18px | cards, diálogos, menu do avatar |

  Cantos "suaves" desde 2026-11-06 (antes 8, 10 e 14). A doca usa 24px e os atalhos
  `--r-card` + 8px.
  | `full` | 999px | só pílulas e barras |

- **Sombras:** nenhuma. A hierarquia vem do tom da superfície. A única exceção é o diálogo, que
  usa um véu `rgb(0 0 0 / 0.45)` atrás.
- **Z-index:** doca e barra do celular 30, menu do avatar 40, botão do assistente 40, diálogo e ⌘K 50, aviso (toast) 60.
- **Toque:** área clicável mínima de 40px no desktop e 44px no mobile.

## Componentes

| Componente | Especificação |
|---|---|
| **Button** | 40px de altura, `--radius-control`, 14px/600 |
| **IconButton** | 40px (desktop) ou 44px (mobile), com `aria-label` obrigatório |
| **Input / Select** | `--surface`, borda `--border`; foco com borda `--accent` e anel de 3px em `--accent` a 25% (box-shadow, acompanha o canto). O contorno genérico de foco mora em `@layer base` para não desenhar um segundo retângulo em volta dos campos |
| **Conta (EqRow)** | conta de dinheiro mostrada inteira, linha a linha: coluna de operação (`+ − = ÷`) em Bricolage 700 `--muted`, rótulo com a origem embaixo (12px), valor tabular à direita. Toda parcela aparece, mesmo valendo zero ("todas já caíram"); linhas `=` em 600 com linha `--border` em cima. Usada na Previsão do ciclo |
| **Select em lista** | controle repetido em cada linha (categoria da transação): `--surface-2`, sem contorno; a borda `--border` só aparece no hover e o foco é igual ao do Input |
| **Salvar em lista** | some (`invisible`, guarda o lugar) até a linha ter mudança; Enter também salva |
| **Card** | `--surface`, `--radius-card`, padding 24px, sem borda |
| **Pill de status** | fundo da cor a 15%, texto na cor e forma ● (ok), ▲ (atenção) ou ■ (ruim). A forma sempre acompanha a cor |
| **CategoryIcon** | 36px (lista) ou 28px (compacto), `--radius-chip`, fundo tingido e ícone Lucide na cor da família |
| **Meter** | trilha `--surface-2` de 8px, preenchimento na cor semântica, escala embaixo nomeando a meta |
| **Toast** | fundo `--foreground`, texto `--background`, canto inferior direito, some em 3s |
| **Doca** (`components/shell/dock.tsx`) | seções numa doca flutuante embaixo, centrada: `--surface` a 90%, borda `--card-edge`, raio 24px. Itens de 48px em `--surface-2`, raio 15px, ícone na cor da seção; crescem até 70px perto do ponteiro. Ativo: ponto de 5px embaixo. Nome num balão ao passar o mouse. O Assistente fica separado por uma linha, e o último item abre o ⌘K |
| **Barra do celular** (`shell/mobile-nav.tsx`) | abaixo de 640px a doca vira uma barra flutuante (inset 12px, raio 24px) com 5 abas no máximo: Visão geral, Transações, Orçamentos, Cofrinhos e "Mais" (Desejos, Contas, Assistente). Rótulo em 12px |
| **Menu do avatar** (`shell/account-menu.tsx`) | círculo de 44px com a inicial, no canto direito da linha da marca. Abre: sincronizar, tema, sons, avisos de banco parado (ponto `--warning` no avatar), Perfil e Sair |
| **⌘K** (`shell/palette.tsx`) | paleta de comandos (⌘K ou Ctrl+K, botão "Buscar ou ir para…" e item da doca): ir para seção, sincronizar, tema, sons, perfil e sair. Setas, Enter e Esc |
| **Atalho** (`dashboard/actions.tsx`) | botão grande em pastel (`--tile-gold`, `--tile-blue`, `--tile-violet`, `--tile-pink`, tinta `--tile-ink`, iguais nos dois temas) com brilho de cima, ícone, título em Bricolage e um número real embaixo. Quatro na Visão geral: Guardar, Fatura, Precisava?, Desejos |

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
| Entrada da página | 0.5s | `power3.out` | y 16 → 0, autoAlpha, stagger 0.06 (`motion.enter`). Sem overshoot: o card inteiro nunca passa do ponto |
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
| Diálogo | entrada 0.42s `back.out(1.7)`, saída 0.18s `power2.in` | | scale 0.9 → 1, y 16 → 0, autoAlpha; véu em autoAlpha |
| Troca de página | 0.3s | `power2.out` | `<main>` só aparece (autoAlpha, `motion.page`); quem sobe são os cards, para não somar dois movimentos |
| Doca (entrar) | 0.7s | `back.out(1.4)` | sobe 90px ao abrir o app |
| Doca (ímã) | 0.25s | `power3.out` | cada ícone cresce até +22px conforme a distância do ponteiro (130px de alcance) |
| Atalhos | 0.6s `back.out(2)` ao entrar (scale 0.85, leve giro); clique: scale 0.92 → 1 `elastic.out(1, 0.5)` | | |
| Menu do avatar e ⌘K | 0.3s | `back.out(1.8)` / `back.out(1.6)` | descem 8 a 14px e crescem de 0.96 |
| Clique em botão | 120ms | CSS | scale 0.96 (ícone: 0.9) |
| Cofre (login) | ~5s | `dial` (CustomEase) | segredo +620° −230° +95°, ferrolhos x −38, maçaneta 90°. Um anel de luz escapa em volta da porta (0,7s `sine.inOut`); a porta abre (rotationY −108°, 1,25s `power2.inOut`) enquanto a câmera avança (scale 1,35, 1,7s); a luz quente nasce do vão (scale 0,08 → 1, 1,15s `expo.inOut`, degradê longo, sem borda dura) e o fundo do app entra por cima dela em 0,7s. Antes era um clarão amarelo trocado de uma vez pelo fundo |
| Fechamento | abre/fecha 0.8s/0.55s `power3.inOut` | | clip-path círculo; letras yPercent 115 → 0, stagger 0.022; valor conta em 1.4s |
| Carta do jogo | 0.5s `power3.in` | | voa para o cesto girando ±35° e some em scale 0.18; solta sem jogar: volta com `elastic.out(1, 0.5)` |
| Moeda no pote | 0.75s `power1.inOut` | | arco (MotionPath) até a tampa, achata, cai e quica (`bounce.out`) |
| Pulinho (`boing`) | 0.6s | `elastic.out(1, 0.5)` | scale 1.18 → 1 em contadores, cestos e selos |

**Reduzir movimento:** toda animação GSAP passa por `gsap.matchMedia()` com
`(prefers-reduced-motion: reduce)`. Nesse modo, os elementos vão direto ao estado final (`set`).
O CSS zera as transições no mesmo media query.

Animar só `transform`, `opacity`/`autoAlpha` e atributos de SVG. Nunca `width`, `height`, `top`
ou `left`.

## Jogo e pote

- **Precisava ou foi vontade?** Cada gasto do ciclo (saídas de categoria de despesa, sem
  transferências) é uma carta, as maiores primeiro. A jogada fica em `Transaction.need`
  (true precisava, false vontade, null ainda não). O card "Precisava × vontade" mostra a parte que
  foi vontade, a comparação com o ciclo anterior, onde a vontade mais pesou, os últimos 6 ciclos e
  quanto sobraria cortando metade. Também entra no fechamento do ciclo quando há cartas jogadas.
- **Pote do desejo:** `WishItem.saved`, uma meta por desejo (o dinheiro de verdade continua onde
  está). Cada R$ 10 vira uma moeda até a linha da meta (42 moedas).

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

Cinco sons sintetizados (`lib/sound.ts`, `playSound(kind)`), todos com menos de 0,4s e em Dó
maior para soarem como família. Cada um tem um significado só (revisão de 2026-11-06):

| Som | Significado | Onde |
|---|---|---|
| `coin` | dinheiro entrou | sync com novidade, cofrinho que cresceu, moeda no pote. O "tlim" de sempre: 1568 e 2093 Hz, sem filtro (o Daniel prefere este) |
| `tap` | ação confirmada | trocar categoria, jogar carta, botões de card e menus. Discreto desde 2026-11-07: "tuc" de 45ms em ~520 Hz, baixinho, com a altura variando ±4% a cada clique para não cansar |
| `whoosh` | algo abriu | fechamento do ciclo, porta do cofre |
| `low` | atenção | senha errada (duas notas descendo, sem cara de alarme) |
| `fanfare` | conquista | meta do pote batida, ciclo que fechou no azul, jogo com pouca vontade |
| `tick`, `clunk`, `latch`, `door` | o cofre abrindo | clique do segredo a cada 5 números, baque dos ferrolhos (4, em pares), "clac" da maçaneta e a porta pesada (rangido grave, ronco e o ar entrando) |

O onboarding pergunta ("Quer ouvir os sons do app?") e toca a moeda como amostra; o botão do topo
liga e desliga. Sem escolha, fica ligado. Nunca toca sem um gesto da pessoa antes e nunca dura
mais de 3s. Escolha em `localStorage` (`mf_sound`).

## Outro computador (2026-11-07)

Sem nuvem: os dados viajam num arquivo `.finora` (`services/backup.py`). Cabeçalho em texto
(computador, data, versão, revisão do banco, dono) e o resto criptografado com a senha da
exportação (Scrypt + Fernet): o banco inteiro e as chaves do `.env` que os dados precisam (2FA,
Pluggy, e-mail). Importar troca os dados e guarda o banco anterior; arquivo de versão mais nova é
recusado. Onde aparece: card **Usar em outro computador** no Perfil (`profile/transfer.tsx`),
**Traga seus dados** na tela de boas-vindas (`/setup/import`, só sem usuário), item no menu do
avatar e comando no ⌘K. Depois de importar, volta ao login com o aviso "Dados de <computador>
trazidos". O arquivo vai para Downloads (o navegador do programa não baixa arquivos) com o botão
**Mostrar na pasta**.

## Texto

Escrever em pt-BR, no tom de quem fala com você sobre o seu dinheiro: direto, sem jargão de
banco e sem travessão. Cada índice traz uma linha que diz o que ele significa. Os números da
frase-resumo vêm da API; nada é inventado.
