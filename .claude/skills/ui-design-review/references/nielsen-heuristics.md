# As 10 Heurísticas de Usabilidade de Nielsen

Para cada heurística: definição curta + perguntas objetivas para aplicar na revisão.

## 1. Visibilidade do status do sistema
O sistema deve manter o usuário informado sobre o que está acontecendo, com feedback em tempo razoável.
- Toda ação (clique, envio, upload) tem algum feedback visual imediato (loading, toast, mudança de estado)?
- Processos longos (>1s) têm indicador de progresso?
- O usuário sabe em que passo/tela está dentro de um fluxo maior (breadcrumb, stepper, título)?

## 2. Correspondência entre o sistema e o mundo real
A interface deve falar a língua do usuário, com palavras, frases e conceitos familiares, seguindo convenções do mundo real.
- Os termos usados são os que o usuário usaria, não jargão interno/técnico?
- Ícones remetem a metáforas reconhecíveis (lixeira = excluir, lupa = buscar)?
- A ordem das informações segue uma lógica natural (ex. datas em ordem cronológica)?

## 3. Controle e liberdade do usuário
Usuários erram e precisam de uma "saída de emergência" clara sem precisar passar por um processo longo.
- Existe "cancelar", "voltar" ou "desfazer" em ações importantes?
- Ações destrutivas (excluir, cancelar assinatura) pedem confirmação ou oferecem desfazer?
- É fácil sair de um fluxo/modal sem perder o que não precisa perder?

## 4. Consistência e padrões
Não fazer o usuário se perguntar se palavras, situações ou ações diferentes significam a mesma coisa. Seguir convenções da plataforma.
- Botões com a mesma função têm o mesmo estilo em todas as telas?
- Padrões da plataforma são respeitados (ex. botão primário à direita em iOS, gestos padrão)?
- Terminologia é consistente (não chamar a mesma coisa de "excluir" numa tela e "remover" em outra)?

## 5. Prevenção de erros
Melhor que boas mensagens de erro é um design que previne o problema de acontecer.
- Campos com formato específico (telefone, CEP, data) guiam ou validam o input?
- Ações destrutivas/irreversíveis pedem confirmação explícita?
- Botões são desabilitados/ocultos quando a ação ainda não é válida, em vez de permitir erro e só depois avisar?

## 6. Reconhecimento em vez de memorização
Minimizar a carga de memória do usuário tornando objetos, ações e opções visíveis.
- O usuário precisa lembrar informação de uma tela anterior para completar a atual?
- Opções e ações disponíveis estão visíveis, não escondidas atrás de "descoberta"?
- Formulários longos mostram o que já foi preenchido antes (resumo) em vez de exigir memorização?

## 7. Flexibilidade e eficiência de uso
Aceleradores — invisíveis para o novato, mas que aceleram o usuário experiente.
- Existem atalhos de teclado, gestos ou ações em lote para usuários avançados?
- A interface pode ser customizada/filtrada para casos de uso frequentes?
- Fluxos repetitivos têm forma de pular etapas já conhecidas?

## 8. Design estético e minimalista
Diálogos não devem conter informação irrelevante ou raramente necessária; cada unidade extra de informação compete com as relevantes.
- Há elementos, textos ou opções que não ajudam a tarefa principal da tela?
- A hierarquia visual deixa claro o que é a ação/informação principal vs. secundária?
- Densidade de informação está adequada ao contexto (mobile vs. desktop, tarefa rápida vs. exploração)?

## 9. Ajudar os usuários a reconhecer, diagnosticar e corrigir erros
Mensagens de erro em linguagem simples (sem código), indicando precisamente o problema e sugerindo uma solução.
- Mensagens de erro dizem o que aconteceu e como resolver, em vez de só "erro" ou código técnico?
- O erro aparece perto do campo/ação que causou o problema?
- O tom da mensagem é neutro/construtivo, não culpa o usuário?

## 10. Ajuda e documentação
Idealmente o sistema não precisa de explicação, mas quando necessário a ajuda deve ser fácil de buscar, focada na tarefa do usuário, com passos concretos.
- Fluxos complexos ou telas novas têm algum tooltip, exemplo ou texto de apoio contextual?
- Se existe uma central de ajuda, ela está acessível a partir do ponto onde o usuário provavelmente vai precisar dela?
