"""Assistente (o mascote escolhido no Perfil): conversa com o modelo local, que consulta o
app por ferramentas.

Regra central: o modelo não faz contas nem lê o banco. Ele pede os números às ferramentas
abaixo (funções que já existem, testadas) e só explica. Todas são somente leitura.
"""

import json
import logging
import re
import threading
import time
from collections.abc import Callable, Iterator
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db.models import CategoryKind, WishItem, WishStatus
from app.services import affordability, analytics, insights, llm, mascot
from app.services import cycles as cycle_service
from app.services import wishlist as wish_service
from app.services.cycles import shift_key

logger = logging.getLogger(__name__)

MAX_ROUNDS = 5  # rodadas de ferramenta antes de desistir
MAX_HISTORY = 20
MAX_MESSAGE_CHARS = 4000
_KEY = re.compile(r"^\d{4}-\d{2}$")
_THINK = re.compile(r"<think>.*?</think>\s*", re.DOTALL)


class ToolError(Exception):
    pass


def _cycle_arg(args: dict, db: Session, today: date) -> str:
    key = args.get("ciclo") or analytics.current_cycle(db, today)["key"]
    if not _KEY.match(str(key)):
        raise ToolError('Use o ciclo no formato "AAAA-MM", o mês em que ele começa.')
    return str(key)


# --- ferramentas ----------------------------------------------------------------


def _resumo(db: Session, today: date, args: dict) -> dict:
    s = analytics.summary(db, _cycle_arg(args, db, today), today)
    keep = (
        "cycle income expense savings_rate flow notes projected_expense liquid_balance card_debt "
        "invested available_now next_bill_due next_bill_amount avg_monthly_expense "
        "avg_monthly_income emergency_reserve_months fixed_monthly installments_monthly "
        "fixed_commitment health"
    ).split()
    out = {k: s[k] for k in keep}
    out["flow"] = {k: v for k, v in s["flow"].items() if k != "bills"}
    return out


def _previsao(db: Session, today: date, args: dict) -> dict:
    ctx = affordability.context(db, today)
    f = dict(ctx["forecast"])
    # Campos internos da tela (chaves, flags de ignorar), que só gastariam leitura do modelo
    f["cycle"] = {k: f["cycle"][k] for k in ("key", "start", "end")}
    f["incomes"] = [
        {k: i[k] for k in ("label", "expected", "received", "remaining", "expected_date")}
        for i in f["incomes"]
        if i.get("counted", True)
    ]
    if not f["tithe"]["rate"]:
        del f["tithe"]  # dízimo desligado: só confundiria o modelo
    f["saude"] = ctx["health"]
    return f


def _categorias(db: Session, today: date, args: dict) -> list[dict]:
    rows = analytics.categories_breakdown(db, _cycle_arg(args, db, today))
    return [r for r in rows if r["spent"] or r["budget"]][:20]


def _historico(db: Session, today: date, args: dict) -> list[dict]:
    n = min(max(int(args.get("ciclos") or 6), 1), 12)
    return analytics.cashflow(db, analytics.current_cycle(db, today)["key"], n)


def _recorrentes(db: Session, today: date, args: dict) -> list[dict]:
    return [
        {k: r[k] for k in ("name", "category_name", "monthly_amount", "last_date")}
        for r in analytics.recurring(db, today)[:20]
    ]


def _parcelas(db: Session, today: date, args: dict) -> list[dict]:
    return analytics.installments(db)[:20]


def _desejos(db: Session, today: date, args: dict) -> dict:
    items = list(
        db.scalars(
            select(WishItem).options(selectinload(WishItem.group)).order_by(WishItem.priority)
        )
    )
    totals = wish_service.totals(items)
    ctx = affordability.context(db, today)
    return {
        "total_desejado": totals["wanted"],
        # Saúde financeira e veredito de cada item já calculados: o modelo só lê
        "saude": ctx["health"],
        "itens": [
            {
                "nome": i.name,
                "preco": i.price,
                "grupo": i.group.name if i.group else None,
                "prioridade": {1: "alta", 2: "média", 3: "baixa"}.get(i.priority),
                "preco_alvo": i.target_price,
                "avaliacao": affordability.evaluate(i.price, ctx),
            }
            for i in items
            if i.status == WishStatus.WANTED
        ][:30],
        # Cada `avaliacao` é do item sozinho; aqui, quais cabem juntos, por prioridade
        "cabem_juntos": affordability.together(
            [(i.name, i.price) for i in items if i.status == WishStatus.WANTED], ctx
        ),
    }


def _avaliar_compra(db: Session, today: date, args: dict) -> dict:
    try:
        price = Decimal(str(args.get("valor")))
    except (ArithmeticError, ValueError) as e:
        raise ToolError("Informe `valor` em reais, como 1299.90.") from e
    if not price.is_finite() or price <= 0:
        raise ToolError("Informe `valor` em reais, maior que zero.")
    ctx = affordability.context(db, today)
    return {"saude": ctx["health"], **affordability.evaluate(price, ctx)}


def _transacoes(db: Session, today: date, args: dict) -> dict:
    key = _cycle_arg(args, db, today)
    back = min(max(int(args.get("ciclos") or 1), 1), 6)
    text = str(args.get("texto") or "").lower().strip()
    category = str(args.get("categoria") or "").lower().strip()
    limit = min(max(int(args.get("limite") or 30), 1), 50)
    cyc = cycle_service.load(db)
    rows = [
        r
        for r in analytics._rows(db, cyc, shift_key(key, -(back - 1)), key)
        if r.kind != CategoryKind.TRANSFER
        and (not text or text in r.label.lower())
        and (not category or category in r.category_name.lower())
    ]
    rows.sort(key=lambda r: r.posted, reverse=True)
    return {
        "encontradas": len(rows),
        "total": sum((r.amount for r in rows), Decimal("0")),
        "mostrando": len(rows[:limit]),
        "transacoes": [
            {
                "data": r.posted,
                "ciclo": r.cycle,
                "descricao": insights.clean(r.label),
                "valor": r.amount,
                "categoria": r.category_name,
            }
            for r in rows[:limit]
        ],
    }


def _padroes(db: Session, today: date, args: dict) -> list[dict]:
    return insights.find(db, today)


_CYCLE = {"type": "string", "description": 'Ciclo "AAAA-MM" (mês em que começa). Padrão: atual.'}

TOOLS: dict[str, tuple[Callable, str, str, dict]] = {
    # nome: (função, rótulo na tela, descrição para o modelo, parâmetros)
    "resumo_do_ciclo": (
        _resumo,
        "Lendo o resumo do ciclo",
        "Conta do ciclo (começou com, entradas, gastos, faturas, guardado, terminou com), "
        "saldo em conta, faturas a pagar, reserva de emergência em meses, contas fixas, "
        "parcelas, nota de saúde financeira e avisos do ciclo.",
        {"ciclo": _CYCLE},
    ),
    "previsao": (
        _previsao,
        "Calculando a previsão",
        "Previsão até o fim do ciclo atual: entradas que ainda vêm, contas fixas que faltam, "
        "spendable (quanto dá para gastar até o fim do ciclo) e daily_allowance (por dia).",
        {},
    ),
    "categorias": (
        _categorias,
        "Somando as categorias",
        "Gasto por categoria no ciclo, média dos 3 ciclos anteriores, orçamento e anomalias.",
        {"ciclo": _CYCLE},
    ),
    "historico": (
        _historico,
        "Olhando os ciclos anteriores",
        "Receitas, despesas e saldo de cada um dos últimos ciclos.",
        {"ciclos": {"type": "integer", "description": "Quantos ciclos (1 a 12). Padrão 6."}},
    ),
    "recorrentes": (
        _recorrentes,
        "Listando as contas fixas",
        "Contas e assinaturas que se repetem todo ciclo, com o valor de cada uma.",
        {},
    ),
    "parcelas": (
        _parcelas,
        "Listando as parcelas",
        "Compras parceladas em andamento: valor da parcela, quantas faltam e quando acabam.",
        {},
    ),
    "desejos": (
        _desejos,
        "Abrindo a lista de desejos",
        "Itens da lista de desejos ainda não comprados, com preço, grupo, prioridade e a "
        "avaliação de cada um (cabe, aperta ou não cabe neste ciclo, parcelamento sugerido, "
        "quanto tempo para juntar) junto da saúde financeira.",
        {},
    ),
    "avaliar_compra": (
        _avaliar_compra,
        "Vendo se a compra cabe",
        "Avalia uma compra de qualquer valor que não está na lista de desejos: se cabe neste "
        "ciclo, se aperta, se não cabe, com a saúde financeira, o parcelamento sugerido e "
        "quanto tempo para juntar.",
        {"valor": {"type": "number", "description": "Preço à vista em reais (ex.: 1299.90)."}},
    ),
    "buscar_transacoes": (
        _transacoes,
        "Procurando transações",
        "Busca lançamentos por texto na descrição e/ou categoria. Devolve quantos achou, a "
        "soma (negativo = saída) e até `limite` lançamentos, os mais recentes primeiro.",
        {
            "texto": {"type": "string", "description": "Trecho da descrição (ex.: uber)."},
            "categoria": {"type": "string", "description": "Trecho do nome da categoria."},
            "ciclo": _CYCLE,
            "ciclos": {
                "type": "integer",
                "description": "Quantos ciclos até `ciclo`, inclusive (1 a 6). Padrão 1.",
            },
            "limite": {"type": "integer", "description": "Máximo de lançamentos (até 50)."},
        },
    ),
    "padroes": (
        _padroes,
        "Procurando padrões",
        "Padrões já detectados pelo app: orçamentos estourados, categorias acima do normal ou "
        "subindo, contas que ficaram mais caras, compras frequentes, parcelas acabando, "
        "reserva, comprometimento da renda e previsão.",
        {},
    ),
}


def tool_specs() -> list[dict]:
    return [
        {
            "type": "function",
            "function": {
                "name": name,
                "description": description,
                "parameters": {"type": "object", "properties": params, "required": []},
            },
        }
        for name, (_, _, description, params) in TOOLS.items()
    ]


def run_tool(db: Session, today: date, name: str, args: dict) -> str:
    """Resultado em JSON para o modelo; erro vira texto, para ele tentar de novo ou explicar."""
    entry = TOOLS.get(name)
    if entry is None:
        return json.dumps({"erro": f"Ferramenta {name} não existe."}, ensure_ascii=False)
    try:
        result = entry[0](db, today, args or {})
    except (ToolError, ValueError) as e:
        return json.dumps({"erro": str(e)}, ensure_ascii=False)
    return json.dumps(_compact(result), default=str, ensure_ascii=False, separators=(",", ":"))


def _compact(value):
    """Menos texto para o modelo ler (cada token lido custa tempo): frações com 3 casas e
    nomes de banco sem os espaços de preenchimento ("CLAUDE SUB    .SAN")."""
    if isinstance(value, dict):
        return {k: _compact(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_compact(v) for v in value]
    if isinstance(value, float):
        return round(value, 3)
    if isinstance(value, str):
        return " ".join(value.split())
    return value


# --- conversa -----------------------------------------------------------------


def system_prompt(db: Session, today: date) -> str:
    cycle = analytics.current_cycle(db, today)
    if cycle["start_day"]:
        day = cycle["start_day"]
        rule = f"vão do dia {day} até a véspera desse dia no mês seguinte"
    else:
        rule = "acompanham o fechamento da fatura do cartão principal"
    name = mascot.mascot_name(db)
    return f"""Você é o {name}, o assistente do Finora, um app de finanças pessoais que roda
só no computador do usuário. Responda em português do Brasil, curto e direto (até 6 frases ou
uma lista curta), num tom calmo e amigável.

Hoje é {today:%d/%m/%Y}. O ciclo atual é {cycle["key"]} ({cycle["start"]:%d/%m} a \
{cycle["end"]:%d/%m}). Os ciclos {rule}; cada um é chamado pelo mês em que começa ("AAAA-MM").

Regras:
- Todo número que você citar tem que vir de uma ferramenta. Não invente, não estime e não faça
  contas de cabeça: use a ferramenta que já traz o total. Se nenhuma traz o dado, diga isso.
- Valores em reais assim: R$ 1.234,56. Valores negativos nas transações são saídas.
- Nunca mostre nomes de campos das ferramentas (como spendable ou daily_allowance): fale em
  português, com os termos do app.
- "Livre agora" é o dinheiro em conta menos as faturas a pagar. "Dá para gastar no dia a dia"
  (spendable, e daily_allowance por dia) é o que sobra até o fim do ciclo depois das contas
  fixas, parcelas, dízimo e da meta de guardar (savings.goal), que já fica separada.
- "Até a próxima entrada" (until_income) é o que o dinheiro de hoje precisa cobrir até o
  salário cair; use isso quando a pergunta for sobre os próximos dias.
- Para "posso comprar X?" ou "o que da lista de desejos dá para comprar?", use a avaliação
  pronta: a ferramenta desejos (cada item traz `avaliacao`) ou avaliar_compra para um valor
  qualquer. Não compare preços por conta própria. Diga o veredito (cabe, aperta, não cabe), o
  motivo e a recomendação, nessa ordem.
- Saúde financeira vem antes do desejo: se a reserva de emergência estiver abaixo de 3 meses ou
  os compromissos fixos acima de 30% da renda, diga isso antes de sugerir qualquer compra.
- Item caro demais: se a avaliação trouxer parcelamento, diga em quantas vezes e de quanto fica
  a parcela, lembrando de conferir se é sem juros. Se trouxer `juntar`, diga em quantos ciclos
  dá para juntar e quanto guardar por ciclo; sugira criar um cofrinho para isso.
- Cada avaliação é do item sozinho. Se perguntarem por mais de um, use `cabem_juntos`: só os
  itens listados ali cabem juntos sem apertar, na ordem de prioridade.
- Recomendações práticas, baseadas nos dados do usuário. Não indique produtos financeiros
  específicos (ações, fundos, bancos)."""


def _clean_history(history: list[dict]) -> list[dict]:
    out = []
    for m in history[-MAX_HISTORY:]:
        if m.get("role") in ("user", "assistant") and isinstance(m.get("content"), str):
            out.append({"role": m["role"], "content": m["content"][:MAX_MESSAGE_CHARS]})
    return out


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False, default=str)}\n\n"


class _ThinkFilter:
    """Tira blocos <think>…</think> que versões antigas do Ollama deixam no texto."""

    def __init__(self) -> None:
        self.buffer = ""
        self.inside = False

    def feed(self, text: str) -> str:
        self.buffer += text
        out = ""
        while self.buffer:
            if self.inside:
                end = self.buffer.find("</think>")
                if end < 0:
                    return out
                self.buffer = self.buffer[end + len("</think>") :].lstrip()
                self.inside = False
            else:
                start = self.buffer.find("<think>")
                if start < 0:
                    # Guarda um possível começo de tag cortado no meio
                    keep = next(
                        (i for i in range(1, 7) if "<think>".startswith(self.buffer[-i:])), 0
                    )
                    cut = len(self.buffer) - keep
                    out, self.buffer = out + self.buffer[:cut], self.buffer[cut:]
                    return out
                out += self.buffer[:start]
                self.buffer = self.buffer[start + len("<think>") :]
                self.inside = True
        return out

    def flush(self) -> str:
        rest, self.buffer = ("" if self.inside else self.buffer), ""
        return rest


_warm_lock = threading.Lock()
_warmed: dict[str, float] = {}  # chave (modelo + dia) -> quando aqueceu
WARM_AGAIN_AFTER = 25 * 60  # o modelo fica carregado 30 min (llm.KEEP_ALIVE)


def warm_up(db: Session, today: date) -> bool:
    """Prepara o modelo para a próxima pergunta, em segundo plano. Chamado quando a conversa
    abre ou o campo ganha foco. Devolve False se nem precisou (já está quente)."""
    model = llm.get_model(db)
    if not llm.is_installed(model, llm.installed()):
        return False
    key = f"{model}|{today}"
    hot = any(llm._same_model(m, model) for m in llm.loaded())
    if hot and time.monotonic() - _warmed.get(key, -WARM_AGAIN_AFTER) < WARM_AGAIN_AFTER:
        return False
    # Mesmo começo de uma pergunta de verdade: instruções do dia + ferramentas
    messages = [
        {"role": "system", "content": system_prompt(db, today)},
        {"role": "user", "content": "oi"},
    ]
    tools = tool_specs()

    def run() -> None:
        if not _warm_lock.acquire(blocking=False):
            return  # já tem um aquecendo
        try:
            llm.warm_up(model, messages, tools)
            _warmed[key] = time.monotonic()
        finally:
            _warm_lock.release()

    threading.Thread(target=run, name="llm-warmup", daemon=True).start()
    return True


def answer(db: Session, history: list[dict], today: date, http=None) -> Iterator[str]:
    """Responde à última mensagem, em eventos SSE: `tool` (consultando), `text` (pedaço da
    resposta), `error` e `done`."""
    model = llm.get_model(db)
    messages = [{"role": "system", "content": system_prompt(db, today)}]
    messages += _clean_history(history)
    tools = tool_specs()
    try:
        for _ in range(MAX_ROUNDS):
            content, calls = "", []
            think = _ThinkFilter()
            for chunk in llm.chat_stream(model, messages, tools, http=http):
                if chunk.get("tool_calls"):
                    calls += chunk["tool_calls"]
                text = think.feed(chunk.get("content") or "")
                if text:
                    content += text
                    yield _sse({"type": "text", "delta": text})
            tail = think.flush()
            if tail:
                content += tail
                yield _sse({"type": "text", "delta": tail})
            if not calls:
                yield _sse({"type": "done"})
                return
            messages.append({"role": "assistant", "content": content, "tool_calls": calls})
            for call in calls:
                fn = call.get("function", {})
                name, args = fn.get("name", ""), fn.get("arguments") or {}
                if isinstance(args, str):
                    try:
                        args = json.loads(args)
                    except json.JSONDecodeError:
                        args = {}
                label = TOOLS[name][1] if name in TOOLS else name
                yield _sse({"type": "tool", "name": name, "label": label})
                result = run_tool(db, today, name, args)
                messages.append({"role": "tool", "content": result, "tool_name": name})
        yield _sse({"type": "error", "message": "Não cheguei a uma resposta. Tente reformular."})
    except llm.LlmError as e:
        yield _sse({"type": "error", "message": str(e)})
    except Exception:
        logger.exception("Assistente falhou")
        yield _sse({"type": "error", "message": "Algo deu errado ao responder."})
