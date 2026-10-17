# Contraste de cores e Tipografia

## Contraste (WCAG 2.1)

Razão de contraste = luminância relativa entre texto/elemento e o fundo, de 1:1 (sem contraste) a 21:1 (preto/branco).

| Elemento | Mínimo AA | Mínimo AAA |
|---|---|---|
| Texto normal (<18pt / <24px, ou <14pt bold) | 4.5:1 | 7:1 |
| Texto grande (≥18pt/24px, ou ≥14pt/18.66px bold) | 3:1 | 4.5:1 |
| Componentes de UI e elementos gráficos (bordas de input, ícones informativos, indicadores de estado) | 3:1 | — |
| Texto puramente decorativo, desabilitado ou dentro de logo | sem requisito | sem requisito |

Checagem prática:
- Pegue a cor do texto/ícone e a cor do fundo imediatamente atrás dele (não a cor de fundo da página, se houver um card por cima).
- Se não souber os hex exatos, estime pela sensação visual — cinza claro sobre branco e texto sobre imagem/gradiente são os casos que mais falham.
- Estados de foco (outline de acessibilidade) também precisam de 3:1 contra o fundo adjacente.
- Nunca usar cor como único indicador de erro/sucesso/status — sempre combinar com ícone ou texto (heurística de acessibilidade além de contraste).

## Tamanho de fonte

Valores de referência para interfaces digitais (mobile e desktop):

| Uso | Tamanho mínimo recomendado |
|---|---|
| Corpo de texto principal | 16px (mobile), 14–16px (desktop) |
| Texto secundário/legenda | 12–13px (nunca abaixo de 11px) |
| Labels de botão | 14–16px |
| Títulos de tela (H1) | 24–32px |
| Subtítulos (H2/H3) | 18–22px |
| Texto legal/fine print | 12px, ainda assim precisa cumprir contraste AA |

Sinais de alerta: texto abaixo de 12px, ou qualquer texto informativo (não decorativo) abaixo de 11px.

## Legibilidade

- **Altura de linha (line-height)**: 1.4–1.6x o tamanho da fonte para parágrafos; 1.2–1.3x para títulos.
- **Comprimento de linha**: 45–75 caracteres por linha para blocos de texto corridos; linhas muito longas (>90 caracteres) cansam a leitura.
- **Peso e família**: evitar mais de 2 famílias de fonte na mesma tela; usar peso (bold/medium/regular) para hierarquia em vez de múltiplas fontes.
- **Maiúsculas**: texto todo em CAIXA ALTA reduz legibilidade em blocos longos — ok para labels curtos (botões, tags), evitar em parágrafos.
- **Justificação**: texto justificado (alinhado nas duas margens) em colunas estreitas cria espaçamento irregular — preferir alinhamento à esquerda.
- **Contraste entre pesos**: se dois níveis de hierarquia usam o mesmo tamanho e cor, aumentar diferença de peso (regular vs. semibold) ou tamanho para que a hierarquia fique clara sem precisar ler o conteúdo.
