# Espessura de borda e uso de contorno

## Espessura recomendada

| Uso | Espessura |
|---|---|
| Borda de input/card padrão | 1px |
| Borda de destaque/foco (outline de acessibilidade) | 2px |
| Divider entre seções/itens de lista | 1px, geralmente com cor mais suave que borda de input |
| Borda de card selecionado/ativo | 2px, com cor de destaque (marca ou estado) |
| Borda "grossa" decorativa (cards de destaque, banners) | 3–4px, usar com moderação — acima disso tende a parecer pesado/desatualizado |

Regras gerais:
- Bordas abaixo de 1px (0.5px) só funcionam bem em telas de alta densidade (retina); em telas comuns podem sumir ou serrilhar.
- Não usar mais de 2 espessuras de borda diferentes na mesma tela sem motivo — cada espessura extra deveria significar um nível de hierarquia diferente (ex: 1px = padrão, 2px = selecionado/foco).
- Cantos muito diferentes de arredondamento (radius) em elementos do mesmo nível de hierarquia quebram consistência — manter radius padronizado por tipo de componente (botão, card, input).

## Borda vs. alternativas para separar elementos

Nem sempre borda é a melhor forma de separar/agrupar elementos — avaliar se o caso pede:
- **Borda (1px)**: quando o elemento precisa de limite claro mesmo sobre fundos variados (inputs, cards em grid denso).
- **Sombra (box-shadow) sutil**: quando se quer sugerir elevação/camada sem adicionar uma linha rígida — comum em cards sobre fundo neutro.
- **Diferença de cor de fundo**: quando o agrupamento é mais importante que o limite exato (seções de uma página, banners).
- **Espaçamento (whitespace) apenas**: a opção mais "leve" — funciona quando os elementos já têm contraste natural de conteúdo entre si (ex: itens de uma lista de texto simples).

Problema comum a sinalizar: usar borda + sombra + fundo diferente ao mesmo tempo no mesmo componente sem necessidade — redundância visual que pesa a interface.

## Espaçamento em torno de bordas

- Padding interno mínimo de inputs/botões: 8–12px vertical, 12–16px horizontal, para não parecer apertado.
- Espaço entre elementos com borda própria (cards, inputs empilhados): pelo menos 8px, idealmente 12–16px, para que a borda de um elemento não seja confundida com a de outro.
