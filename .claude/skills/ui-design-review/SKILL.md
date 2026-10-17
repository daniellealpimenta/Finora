---
name: ui-design-review
description: Faz auditoria de design de UI/UX contra as 10 heurísticas de Nielsen, contraste de cores (WCAG), tamanho e legibilidade de fonte, espessura de borda/contorno e clareza visual de botões e ícones. Use sempre que o usuário pedir para revisar, auditar ou dar feedback sobre uma tela, componente, protótipo, print de interface, arquivo de design ou trecho de UI (HTML/CSS/React/SwiftUI/Figma export etc.), mesmo que ele não use as palavras "heurística", "acessibilidade" ou "auditoria" — por exemplo "dá uma olhada nessa tela", "esse botão tá bom?", "melhora esse design", "essa fonte tá legível?".
---

# Revisão de Design de UI/UX

Skill para revisar telas, componentes e protótipos contra critérios objetivos de usabilidade e legibilidade. Combina as heurísticas de Nielsen (avaliação qualitativa) com checagens quantitativas de contraste, tipografia, bordas e affordance de botões/ícones.

## Quando usar

- Usuário envia um print, arquivo de design, componente de código (HTML/CSS/React/SwiftUI/etc.) ou link e pede opinião, revisão ou "isso está bom?".
- Usuário pede para "auditar", "revisar" ou "dar feedback" sobre uma interface.
- Usuário está construindo uma tela e pede para você mesmo aplicar boas práticas antes de finalizar.

## Como conduzir a revisão

1. **Reúna o material**: imagem da tela, código-fonte do componente, ou ambos. Se só houver código, monte mentalmente (ou renderize, se tiver ferramenta) como o usuário veria a tela.
2. **Rode os 5 blocos de checagem abaixo, nesta ordem**. Cada bloco tem um arquivo de referência com os critérios detalhados — leia o arquivo relevante antes de aplicar os critérios, não confie só na memória.
3. **Reporte em formato de auditoria**, não em prosa solta:
   - Agrupe achados por bloco (Heurísticas / Contraste / Tipografia / Bordas / Botões e Ícones).
   - Para cada achado: o que está errado, por que é um problema (cite a heurística ou métrica), e uma sugestão concreta de correção (valor, não vago — ex. "aumentar de 12px para 14px", não "aumentar a fonte").
   - Separe achados **críticos** (bloqueiam uso, ex. contraste abaixo do mínimo, ação destrutiva sem confirmação) de **sugestões** (poliment­o).
4. Se o usuário pedir para já corrigir o código/design, aplique as correções depois de listar os achados — não pule direto para o código sem explicar o porquê.

## Os 5 blocos de checagem

### 1. Heurísticas de Nielsen
Avaliação qualitativa das 10 heurísticas clássicas de usabilidade (visibilidade do status do sistema, correspondência com o mundo real, controle do usuário, consistência, prevenção de erros, reconhecimento vs. memorização, flexibilidade, design minimalista, recuperação de erros, ajuda/documentação).
→ Leia `references/nielsen-heuristics.md` para a lista completa com perguntas de checagem para cada heurística.

### 2. Contraste de cores (WCAG)
Checagem quantitativa de contraste texto/fundo e elementos de UI/fundo contra os limites do WCAG 2.1 (AA e AAA).
→ Leia `references/contraste-e-tipografia.md`.

### 3. Tamanho e legibilidade de fonte
Tamanho mínimo por tipo de texto (corpo, legenda, título), altura de linha, comprimento de linha, peso e contraste entre pesos.
→ Mesmo arquivo: `references/contraste-e-tipografia.md`.

### 4. Espessura de borda / contorno
Espessura mínima/máxima recomendada para bordas de inputs, cards, dividers e estados de foco, e quando usar borda vs. sombra vs. cor de fundo para separar elementos.
→ Leia `references/bordas-e-espacamento.md`.

### 5. Botões e ícones
Tamanho mínimo de alvo de toque, área de clique vs. área visual, clareza do rótulo/ícone, consistência de estilo (preenchido/contornado/texto), estados (hover, active, disabled, loading), e se ícones sozinhos (sem texto) são reconhecíveis.
→ Leia `references/botoes-e-icones.md`.

## Formato de saída sugerido

```
## Auditoria de UI — [nome da tela/componente]

### 🔴 Críticos
- [Bloco] Descrição do problema → correção sugerida

### 🟡 Sugestões
- [Bloco] Descrição do problema → correção sugerida

### ✅ Pontos positivos
- O que já está bem resolvido (vale citar 1-3, não pule essa parte — reforça o que manter)
```

Não liste um bloco inteiro como "sem problemas" sem checar de fato os critérios do arquivo de referência correspondente — isso é o ponto principal da skill.
