# Assistente local (LLM): arquitetura proposta

Status: **fases 1 e 2 implementadas** (2026-10-23), com o Qwen3 8B como padrão.

## O que já existe

- Página **Assistente** (`/assistente`): chat com o Pila em streaming, padrões encontrados e o
  card **Modelo**, que baixa, troca e desinstala modelos pelo Ollama (`app/services/llm.py`).
  Só os modelos do catálogo (`llm.CATALOG`: Qwen3 4B, 8B e 14B) podem ser baixados ou removidos.
- Ferramentas somente leitura em `app/services/assistant.py`: `resumo_do_ciclo`, `previsao`,
  `categorias`, `historico`, `recorrentes`, `parcelas`, `desejos`, `buscar_transacoes`, `padroes`.
- Padrões calculados pelo código em `app/services/insights.py`: orçamento estourado ou perto do
  limite, categoria acima do normal ou subindo há 3 ciclos, conta fixa que ficou mais cara,
  compras frequentes, avisos de virada de ciclo, total das contas fixas, parcelas acabando,
  reserva, comprometimento da renda, poupança e previsão negativa.
- `llm_base_url` só aceita loopback (validador em `app/core/config.py`). A conversa não é salva.
- Qwen3 roda com `think: false` (mais rápido; as contas já vêm das ferramentas).

Falta: a fase 3 (sugestões de categoria com confirmação). O Nemotron 3 Ultra (550B) não cabe
nesta máquina; a versão hospedada da NVIDIA mandaria os dados para fora, e foi descartada.

## Por que local

Os dados são transações, saldos e faturas. Nada disso deve ir para uma API de terceiros. O
modelo roda na própria máquina e o backend só conversa com ele por `127.0.0.1`.

## Peças

```
Front (chat lateral com o Pila)
   │  POST /assistant/chat  (SSE, resposta em streaming)
   ▼
Backend FastAPI ── app/services/assistant.py
   │   1. monta o prompt (papel do Pila + data de hoje + regras)
   │   2. manda para o modelo com a lista de ferramentas
   │   3. executa as ferramentas pedidas (funções Python que já existem)
   │   4. devolve o resultado ao modelo até ele responder em texto
   ▼
Ollama em 127.0.0.1:11434  (processo separado, fora do app)
```

- **Runtime: Ollama** (`brew install ollama`, depois `ollama pull <modelo>`). Ele expõe API
  própria e uma compatível com OpenAI, e o backend falaria com ele pelo `httpx` que já é
  dependência. Os pesos ficam em `~/.ollama`, **fora do projeto**: a pasta do projeto está na Mesa
  sincronizada com o iCloud, e um modelo de 5 a 10 GB não pode ir para lá. Para mais velocidade
  no Apple Silicon, o LM Studio com MLX expõe a mesma API compatível com OpenAI, então dá para
  trocar sem mexer no backend.
- **Configuração** (`app/core/config.py`): `llm_base_url` (padrão `http://127.0.0.1:11434`) e
  `llm_model`. Um validador Pydantic recusa qualquer host que não seja de loopback, como já
  acontece com `database_url`. Assim, nem um `.env` errado manda dados para fora.

## Modelo (Apple M4, 24 GB)

| Modelo | Tamanho em Q4 | Observação |
|---|---|---|
| Qwen3 8B | ~5 GB | Bom português e boa chamada de ferramentas. **Recomendado para começar.** |
| NVIDIA Nemotron Nano 9B v2 | ~6–7 GB | Raciocínio forte e chamada de ferramentas; português um pouco menos natural. |
| Qwen3 14B | ~9 GB | Melhor qualidade; ainda cabe com folga para o app. |
| Nemotron de ~30B (MoE) | ~18–20 GB | Ocupa quase toda a RAM. Não vale a pena nesta máquina. |

Com um modelo de 8 a 9B em Q4 no M4, a expectativa é de 20 a 30 tokens/s, o que basta para um
chat. O modelo é só uma variável de ambiente: dá para testar os dois e ficar com o melhor.

## Regra central: o modelo não faz contas

LLMs pequenos erram aritmética e inventam números. O modelo **nunca** recebe acesso ao banco nem
faz contas: ele chama ferramentas que devolvem os números já calculados pelo código testado, e
só explica. As ferramentas são funções finas sobre o que já existe:

| Ferramenta | Função |
|---|---|
| `resumo_do_ciclo(mes?)` | `analytics.summary` |
| `previsao()` | `forecast.forecast` (quanto dá para gastar, por dia) |
| `categorias(mes?)` | `analytics.categories_breakdown` (com anomalias e orçamento) |
| `recorrentes()` | `analytics.recurring` |
| `parcelas()` | `analytics.installments` |
| `desejos()` | `GET /wishlist` (totais, grupos, o que cabe no ciclo) |
| `buscar_transacoes(texto?, categoria?, mes?)` | consulta com limite de ~50 linhas |

Todas são **somente leitura**. Ações que mudam dados (criar regra de categoria, marcar desejo
como comprado) voltam como *sugestão* para o front, e o usuário confirma com um clique.

## Usos, em ordem de valor

1. **"Posso comprar X?"**: cruza `previsao` com `desejos` e responde com o número do app, como
   "cabe, sobram R$ 210 para os 9 dias" ou "espere a fatura de dia 10".
2. **O Pila explicando o ciclo**: por que o "dá para gastar" caiu, o que puxou a categoria
   anômala.
3. **Categorizar o que ficou sem categoria**: o modelo sugere a categoria e o padrão, e a
   sugestão só vira `CategoryRule` quando o usuário aceita.
4. **Revisão do mês**: um resumo curto no fim do ciclo.

## Fases

1. `GET /assistant/status` (o Ollama está no ar? qual modelo?) e um chat simples sem ferramentas,
   para medir velocidade e qualidade.
2. Ferramentas somente leitura e streaming SSE; chat lateral com o Pila no front.
3. Sugestões que precisam de confirmação (categorias, regras).

## Decisões em aberto

- **Histórico do chat**: não guardar (mais simples e privado) ou guardar no SQLite, no mesmo
  banco fora do iCloud.
- **Tamanho de contexto**: limitar a resposta das ferramentas (top N) para caber em 8–16k tokens.
- **Testes**: mockar o Ollama com `respx`, como já é feito com a Pluggy, e testar que cada
  ferramenta devolve os mesmos números do dashboard.
