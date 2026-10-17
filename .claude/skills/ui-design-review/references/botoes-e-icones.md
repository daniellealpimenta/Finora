# Botões e Ícones

## Tamanho de alvo de toque

| Plataforma | Tamanho mínimo recomendado |
|---|---|
| Mobile (iOS/Android) | 44x44px (iOS) / 48x48dp (Android) |
| Web (mouse) | 32x32px, com preferência por 40x40px+ em ações primárias |
| Área de toque vs. área visual | um ícone visualmente pequeno (ex: 20px) pode ter área de toque maior (ex: 44px) via padding — checar se isso foi considerado, não só o tamanho do ícone renderizado |

Sinais de alerta: botões/ícones clicáveis menores que o mínimo, especialmente quando estão próximos de outros elementos clicáveis (risco de toque errado).

## Hierarquia de botões

- **Primário**: uma ação principal por tela/seção, visualmente mais forte (preenchido, cor de destaque).
- **Secundário**: contornado ou com fundo neutro, para ações alternativas.
- **Terciário/texto**: sem borda nem preenchimento, para ações de baixo compromisso (ex: "cancelar", "saiba mais").
- Checar: existe mais de um botão "primário" (preenchido, mesma cor forte) na mesma tela competindo por atenção? Isso quebra hierarquia.
- Ações destrutivas (excluir, remover) devem ter estilo visualmente distinto (geralmente vermelho/cor de alerta) e nunca ter o mesmo peso visual que a ação principal positiva, para evitar clique acidental.

## Estados obrigatórios

Todo botão interativo deveria ter estilo definido para:
- **Default** (repouso)
- **Hover** (desktop) — indica que é clicável
- **Active/Pressed** — feedback imediato ao clique
- **Focus** — outline visível para navegação por teclado (contraste mínimo 3:1, ver arquivo de contraste)
- **Disabled** — visualmente distinto (geralmente opacidade reduzida + cursor not-allowed), mas ainda legível o suficiente para entender que existe
- **Loading** (quando a ação dispara requisição) — evita duplo clique e dá feedback de status do sistema (heurística 1 de Nielsen)

Sinalizar quando o design/código só define o estado "default" e nada mais.

## Ícones

- **Reconhecibilidade**: ícone sozinho (sem label de texto) só deve ser usado se for de convenção amplamente estabelecida (lupa=buscar, sino=notificação, engrenagem=configurações, X=fechar, seta=voltar, lixeira=excluir). Ícones ambíguos ou customizados precisam de label de texto ou tooltip.
- **Consistência de estilo**: não misturar ícones outline com ícones preenchidos (filled) no mesmo conjunto/tela sem motivo — escolher uma linguagem visual e manter.
- **Consistência de peso/grossura de traço**: ícones de uma mesma biblioteca/set devem ter a mesma espessura de linha; misturar sets diferentes (ex: um ícone de uma lib e outro desenhado à mão) quebra a consistência visual.
- **Tamanho relativo ao texto**: ícones ao lado de texto (ex: em botões) devem ter altura próxima à altura da caixa do texto (x-height ou line-height), nem muito menores (somem) nem muito maiores (desequilibram).
- **Cor**: ícones puramente decorativos não precisam cumprir contraste, mas ícones informativos (status, ação) sim — mínimo 3:1 contra o fundo (ver arquivo de contraste).
