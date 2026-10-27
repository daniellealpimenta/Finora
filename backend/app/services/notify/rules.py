"""Que avisos estão para sair agora. Tudo calculado pelo código, com as mesmas funções da Visão
geral; o modelo só escreve o comentário do mascote depois (comment.py).

Cada regra recebe o contexto e `fresh(key)`, que diz se aquele aviso ainda não saiu, e devolve
mensagens só com o que é novo. Avisos do mesmo tipo que aparecem juntos (ex.: duas compras no
mesmo sync) viram um e-mail só, com uma chave por item.
"""

import statistics
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
from functools import cached_property

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db.models import (
    Category,
    CategoryKind,
    Connection,
    ConnectionStatus,
    Transaction,
    WishItem,
    WishStatus,
)
from app.services import affordability, analytics, cards, forecast
from app.services import cycles as cycle_service
from app.services.cycles import ONE_DAY, Cycles, shift_key
from app.services.insights import brl, clean
from app.services.notify.render import (
    Bar,
    Box,
    Heading,
    Hero,
    Message,
    P,
    Row,
    Rows,
    Say,
)

ZERO = Decimal("0")
_MONTHS = (
    "janeiro fevereiro março abril maio junho julho agosto setembro outubro novembro dezembro"
).split()
_WEEKDAYS = "segunda terça quarta quinta sexta sábado domingo".split()

# Compra fora da rotina
UNUSUAL_WINDOW = timedelta(days=10)  # só compras recentes viram alerta
UNUSUAL_RATIO = Decimal("3")  # 3x a compra típica da categoria...
UNUSUAL_MIN = Decimal("200")  # ...e acima disto
# "Típica": o valor que só 1/4 das compras da categoria passa. A mediana seria baixa demais em
# categorias de muitas compras pequenas (cafés puxam Restaurantes para R$ 8)
TYPICAL_QUANTILE = 3  # quartil de cima (índice em statistics.quantiles(n=4))
# Mesma loja e valor parecido antes: é compra que se repete (mensalidade, doação), não alerta
REPEAT_LOOKBACK = timedelta(days=400)
REPEAT_TOLERANCE = Decimal("0.2")
UNUSUAL_HISTORY = timedelta(days=180)
UNUSUAL_SAMPLES = 5  # compras na categoria para ter uma "típica"
NEW_STORE_MIN = Decimal("300")
NEW_STORE_LOOKBACK = timedelta(days=365)
DUPLICATE_DAYS = 2
DUPLICATE_MIN = Decimal("20")
STALE_BANK = timedelta(days=3)
CLOSED_CATCHUP = timedelta(days=5)  # resumo do ciclo ainda sai até 5 dias depois do fim

Fresh = Callable[[str], bool]


def month_name(key: str) -> str:
    return _MONTHS[int(key.split("-")[1]) - 1]


def pct(value: float | Decimal) -> str:
    return f"{float(value) * 100:.0f}%".replace(".", ",")


def inclusive(cyc: Cycles, key: str) -> tuple[date, date]:
    """Primeiro e último dia do ciclo (`Cycles.bounds` dá o fim aberto: o dia seguinte)."""
    start, end = cyc.bounds(key)
    return start, end - ONE_DAY


def _when(days: int, day: date) -> str:
    if days <= 0:
        return "hoje"
    if days == 1:
        return "amanhã"
    return f"em {days} dias ({day:%d/%m})"


@dataclass
class Ctx:
    db: Session
    today: date
    now: datetime

    @cached_property
    def cyc(self) -> Cycles:
        return cycle_service.load(self.db)

    @cached_property
    def key(self) -> str:
        return self.cyc.key_of(self.today)

    @cached_property
    def bounds(self) -> tuple[date, date]:
        return inclusive(self.cyc, self.key)

    @cached_property
    def forecast(self) -> dict:
        return forecast.forecast(self.db, self.today)

    @cached_property
    def summary(self) -> dict:
        return analytics.summary(self.db, self.key, self.today)

    @cached_property
    def planning(self) -> dict:
        return forecast.get_planning(self.db)

    def goal_label(self, income: Decimal | None = None) -> str:
        p = self.planning
        if p.get("savings_mode") == "amount":
            return brl(Decimal(str(p.get("savings_goal") or 0)))
        return pct(p.get("savings_rate") or 0)

    def would_save(self) -> tuple[Decimal, float | None]:
        """No ritmo atual: guardado + o que falta da meta + a folga além dela (como a Visão
        geral). E quanto isso é do que entra no ciclo."""
        f = self.forecast
        s = f["savings"]
        value = s["saved"] + s["left"] + f["forecast_end"]
        income = f["cycle_income"]
        return value, (float(value / income) if income > 0 else None)


# --- calendário --------------------------------------------------------------------------


def cycle_ending(ctx: Ctx, fresh: Fresh) -> list[Message]:
    f = ctx.forecast
    days = f["days_left"]
    key = f"cycle_ending:{ctx.key}"
    if not 1 <= days <= 3 or not fresh(key):
        return []
    end = ctx.bounds[1]
    mes = month_name(ctx.key)
    spendable, daily = f["spendable"], f["daily_allowance"]
    save, rate = ctx.would_save()
    pending = [(x["name"], x.get("expected_date"), x["amount"]) for x in f["fixed"]] + [
        (f"parcela {x['name']}", None, x["amount"]) for x in f["installments"]
    ]
    blocks: list = [P(f"O ciclo de {mes} vai até {_WEEKDAYS[end.weekday()]}, {end:%d/%m}.")]
    if spendable > 0:
        blocks.append(
            Hero(
                "Dá para gastar no dia a dia até o fim",
                spendable,
                f"{brl(daily)} por dia, já guardando a meta de {ctx.goal_label()}."
                if daily is not None
                else None,
            )
        )
    else:
        blocks.append(
            Box(
                "warn",
                "O dinheiro do ciclo já acabou.",
                f"Faltam {brl(-spendable)} para fechar guardando a meta de {ctx.goal_label()}.",
            )
        )
    if pending:
        blocks.append(
            Rows(
                [
                    Row(
                        f"Ainda vai cair: {clean(name)}" + (f" ({d:%d/%m})" if d else ""),
                        brl(-amount),
                        "neg",
                    )
                    for name, d, amount in pending
                ],
                private=True,
            )
        )
    rows = [
        Row(
            "Contas e parcelas que ainda vão cair",
            brl(-(f["fixed_left"] + f["installments_left"])),
            "neg",
        ),
        Row("Meta de guardar", brl(f["savings"]["goal"])),
    ]
    if rate is not None:
        rows.append(
            Row(
                "No seu ritmo, você fecha guardando",
                f"{brl(save)} ({pct(rate)})",
                "pos" if save >= f["savings"]["goal"] else "warn",
                strong=True,
            )
        )
    blocks += [Rows(rows), Say("")]
    return [
        Message(
            kind="cycle_ending",
            keys=[key],
            subject=f"Faltam {days} dia{'s' if days > 1 else ''} para o ciclo de {mes} fechar",
            preheader=(
                f"Dá para gastar {brl(spendable)} até {end:%d/%m}, {brl(daily)} por dia"
                if spendable > 0 and daily is not None
                else "O dinheiro do dia a dia deste ciclo já acabou"
            ),
            blocks=blocks,
            discreet_subject=f"O ciclo de {mes} está acabando",
            discreet_text=f"Faltam {days} dias para o ciclo fechar. A previsão está no Finora.",
            facts={
                "dias para o fim": str(days),
                "dá para gastar até o fim": brl(spendable),
                "por dia": brl(daily) if daily is not None else "—",
                "meta de guardar": brl(f["savings"]["goal"]),
                "no ritmo atual, guarda": brl(save),
                "do que entra": pct(rate) if rate is not None else "—",
                "seu ritmo típico por dia": brl(f["daily_typical"]),
            },
        )
    ]


def mid_cycle(ctx: Ctx, fresh: Fresh) -> list[Message]:
    start, end = ctx.bounds
    total = (end - start).days + 1
    elapsed = (ctx.today - start).days + 1
    f = ctx.forecast
    key = f"mid_cycle:{ctx.key}"
    if elapsed / total < 0.5 or f["days_left"] <= 3 or not fresh(key):
        return []
    save, rate = ctx.would_save()
    if rate is None:
        return []
    goal = f["savings"]["goal"]
    mes = month_name(ctx.key)
    gap = goal - save
    days = f["days_left"]
    hint = f" Para bater a meta, segure {brl(gap / days)} por dia." if gap > 0 else ""
    rows = [
        Row("Gasto no ciclo até aqui", brl(ctx.summary["expense"])),
        Row("Seu ritmo típico, por dia", brl(f["daily_typical"])),
    ]
    if f["daily_allowance"] is not None:
        rows.append(
            Row(
                f"Dá para gastar por dia até {end:%d/%m}, guardando a meta",
                brl(f["daily_allowance"]),
                strong=True,
            )
        )
    return [
        Message(
            kind="mid_cycle",
            keys=[key],
            subject=f"Meio do ciclo: no ritmo atual, você guarda {brl(save)}",
            preheader=f"{pct(rate)} do que entra; a meta é {ctx.goal_label()}.{hint}",
            blocks=[
                P(f"Metade do ciclo de {mes} já foi. Esta é a projeção."),
                Hero(
                    "No ritmo atual, o ciclo fecha guardando",
                    save,
                    f"{pct(rate)} do que entra; a meta é {brl(goal)}.",
                ),
                Bar(
                    f"Projeção: {brl(save)}",
                    f"meta {brl(goal)}",
                    float(save / goal) if goal > 0 else 1.0,
                    "pos" if save >= goal else "warn",
                ),
                Rows(rows),
                *([Box("info", "Para bater a meta:", hint.strip())] if gap > 0 else []),
            ],
            discreet_subject=f"Metade do ciclo de {mes}",
            discreet_text="A projeção do meio do ciclo está pronta no Finora.",
        )
    ]


def cycle_closed(ctx: Ctx, fresh: Fresh) -> list[Message]:
    prev = shift_key(ctx.key, -1)
    pstart, pend = inclusive(ctx.cyc, prev)
    key = f"cycle_closed:{prev}"
    if not (pend < ctx.today <= pend + CLOSED_CATCHUP) or not fresh(key):
        return []
    s = analytics.summary(ctx.db, prev, ctx.today)
    flow = s["flow"]
    income = flow["income"]
    out = flow["spent"] + flow["card_bills"]
    kept = income - out
    rate = float(kept / income) if income > 0 else None
    p = ctx.planning
    goal = (
        Decimal(str(p.get("savings_goal") or 0))
        if p.get("savings_mode") == "amount"
        else income * Decimal(str(p.get("savings_rate") or 0))
    )
    mes = month_name(prev)
    blocks: list = [
        P(f"Fechou o ciclo de {pstart:%d/%m} a {pend:%d/%m}. Este foi o resultado."),
        Rows(
            [
                Row("Entrou", brl(income), "pos"),
                Row("Saiu (gastos e faturas)", brl(-out), "neg"),
                Row("Sobrou", brl(kept), "pos" if kept >= 0 else "neg", strong=True),
            ]
        ),
    ]
    if flow["saved"] > 0:
        blocks.append(P(f"Desse valor, {brl(flow['saved'])} foram para os cofrinhos."))
    if rate is not None and goal > 0:
        blocks.append(
            Bar(
                f"Guardado: {pct(rate)}",
                f"meta {ctx.goal_label()}",
                float(kept / goal) if goal > 0 else 1.0,
                "pos" if kept >= goal else "warn",
            )
        )
    cats = analytics.categories_breakdown(ctx.db, prev)
    top = sorted(cats, key=lambda c: c["spent"], reverse=True)[:5]
    if top:
        blocks.append(Heading("Onde foi o dinheiro"))
        rows = []
        for c in top:
            change = c.get("change")
            note = ""
            if change is not None and abs(change) >= 0.05:
                note = f" ({'+' if change > 0 else '−'}{pct(abs(change))} da média)"
            elif change is not None:
                note = " (na média)"
            tone = "neg" if change is not None and change >= 0.2 else None
            rows.append(Row(c["category_name"], brl(c["spent"]) + note, tone))
        blocks.append(Rows(rows))
    for c in cats:
        if c["budget"] and c["spent"] > c["budget"]:
            blocks.append(
                Box(
                    "warn",
                    f"{c['category_name']} passou do orçamento:",
                    f"{brl(c['spent'])} de {brl(c['budget'])}.",
                )
            )
    merchants = analytics.top_merchants(ctx.db, prev, 3)
    if merchants:
        blocks.append(Heading("Onde você mais comprou"))
        blocks.append(
            Rows(
                [Row(f"{clean(m['name'])} ({m['count']}x)", brl(m["total"])) for m in merchants],
                private=True,
            )
        )
    for i in analytics.installments(ctx.db):
        if i["remaining"] == 0 and i["last_month"] == prev:
            blocks.append(
                Box(
                    "ok",
                    f"{clean(i['name'])} terminou.",
                    f"Libera {brl(i['installment_amount'])} por ciclo.",
                )
            )
    score = s["health"]["score"]
    before = analytics.summary(ctx.db, shift_key(prev, -1), ctx.today)["health"]["score"]
    blocks.append(
        P(
            f"Saúde financeira: {score}"
            + (f" (era {before})." if before != score else " (igual ao ciclo anterior).")
            + f" No ciclo de {month_name(ctx.key)} já estão previstos "
            f"{brl(ctx.summary['fixed_monthly'])} em contas fixas."
        )
    )
    blocks.append(Say(""))
    facts = {
        "entrou": brl(income),
        "saiu": brl(out),
        "sobrou": brl(kept),
        "guardou do que entrou": pct(rate) if rate is not None else "—",
        "meta": ctx.goal_label(),
        "saúde financeira": str(score),
        "saúde no ciclo anterior": str(before),
    }
    for c in top[:3]:
        facts[f"gasto em {c['category_name']}"] = brl(c["spent"])
        if c.get("change") is not None:
            facts[f"{c['category_name']} contra a média"] = (
                f"{'+' if c['change'] > 0 else '−'}{pct(abs(c['change']))}"
            )
    return [
        Message(
            kind="cycle_closed",
            keys=[key],
            subject=(
                f"Ciclo de {mes} fechou: sobraram {brl(kept)}"
                if kept >= 0
                else f"Ciclo de {mes} fechou no vermelho: {brl(kept)}"
            ),
            preheader=(
                f"Você guardou {pct(rate)} do que entrou. A meta era {ctx.goal_label()}."
                if rate is not None
                else "O resumo do ciclo está pronto."
            ),
            blocks=blocks,
            discreet_subject=f"O ciclo de {mes} fechou",
            discreet_text="O resumo do ciclo que fechou está pronto no Finora.",
            facts=facts,
        )
    ]


def card_due(ctx: Ctx, fresh: Fresh) -> list[Message]:
    out = []
    bills = cards.unpaid_bills(cards.cards(ctx.db, ctx.today, ctx.cyc))
    for b in bills:
        due, amount = b.get("due_date"), b.get("amount") or ZERO
        if b["status"] not in ("closed", "overdue") or due is None or amount <= 0:
            continue
        days = (due - ctx.today).days
        key = f"card_due:{b['bank']}:{due}"
        if not 0 <= days <= 3 or not fresh(key):
            continue
        liquid = ctx.summary["liquid_balance"]
        blocks: list = [
            Hero(f"Fatura {b['bank']}, vence {due:%d/%m}", amount),
            Rows([Row("Saldo nas contas hoje", brl(liquid))]),
        ]
        if liquid < amount:
            blocks.append(
                Box("warn", "O saldo não cobre a fatura:", f"faltam {brl(amount - liquid)}.")
            )
        blocks.append(P("Pague até o vencimento para evitar juros e multa."))
        out.append(
            Message(
                kind="card_due",
                keys=[key],
                subject=f"Fatura {b['bank']} vence {_when(days, due)}: {brl(amount)}",
                preheader=f"Saldo nas contas hoje: {brl(liquid)}",
                blocks=blocks,
                cta_path="/contas",
                discreet_subject="Uma fatura vence nos próximos dias",
                discreet_text="Uma fatura de cartão vence em breve. Os detalhes estão no Finora.",
            )
        )
    return out


# --- compra fora da rotina -----------------------------------------------------------------


def _expense_txns(db: Session, since: date) -> list[Transaction]:
    expense_ids = set(db.scalars(select(Category.id).where(Category.kind == CategoryKind.EXPENSE)))
    rows = db.scalars(
        select(Transaction)
        .options(selectinload(Transaction.account))
        .where(
            Transaction.date >= since, Transaction.amount < 0, Transaction.is_transfer.is_(False)
        )
        .order_by(Transaction.date, Transaction.id)
    )
    return [t for t in rows if t.category_id is None or t.category_id in expense_ids]


def unusual_purchases(db: Session, today: date) -> list[dict]:
    """Compras recentes que fogem da rotina, com os motivos. Uma por transação."""
    oldest = today - UNUSUAL_WINDOW - NEW_STORE_LOOKBACK
    txns = _expense_txns(db, oldest)
    txns = [t for t in txns if t.date <= today]
    recent = [t for t in txns if t.date >= today - UNUSUAL_WINDOW]
    categories = {c.id: c.name for c in db.scalars(select(Category))}
    by_cat: dict[int, list[Transaction]] = defaultdict(list)
    by_label: dict[str, list[Transaction]] = defaultdict(list)
    for t in txns:
        if t.category_id is not None:
            by_cat[t.category_id].append(t)
        by_label[analytics._normalize(t.description)].append(t)

    found = []
    for t in recent:
        amount = -t.amount
        label = analytics._normalize(t.description)
        first_installment = (t.installment_number or 1) == 1
        reasons: list[str] = []
        typical = None
        repeats = any(
            o.id != t.id
            and t.date - REPEAT_LOOKBACK <= o.date < t.date
            and abs(-o.amount - amount) <= amount * REPEAT_TOLERANCE
            for o in by_label[label]
        )
        if t.category_id is not None and first_installment and not repeats:
            history = [
                -o.amount
                for o in by_cat[t.category_id]
                if o.id != t.id and t.date - UNUSUAL_HISTORY <= o.date <= t.date
            ]
            if len(history) >= UNUSUAL_SAMPLES:
                q = statistics.quantiles(history, n=4)[TYPICAL_QUANTILE - 1]
                typical = Decimal(str(q)).quantize(Decimal("0.01"))
                if amount >= typical * UNUSUAL_RATIO and amount >= UNUSUAL_MIN:
                    times = int(amount / typical) if typical > 0 else 0
                    reasons.append(
                        f"{times}x a sua compra típica em {categories.get(t.category_id)} "
                        f"({brl(typical)})"
                    )
        seen_before = any(
            o.date < t.date and o.date >= t.date - NEW_STORE_LOOKBACK for o in by_label[label]
        )
        if not seen_before and first_installment and not repeats and amount >= NEW_STORE_MIN:
            reasons.append("primeira compra nesta loja no último ano")
        twin = next(
            (
                o
                for o in by_label[label]
                if o.id < t.id
                and o.account_id == t.account_id
                and o.amount == t.amount
                and abs((t.date - o.date).days) <= DUPLICATE_DAYS
            ),
            None,
        )
        if twin is not None and amount >= DUPLICATE_MIN and not t.installment_total:
            reasons.append(f"mesmo valor e loja de outra cobrança em {twin.date:%d/%m}")
        currency = (t.raw or {}).get("currencyCode")
        if currency and currency != "BRL":
            reasons.append(f"compra em moeda estrangeira ({currency})")
        if reasons:
            found.append(
                {
                    "key": f"unusual:{t.id}",
                    "txn": t,
                    "amount": amount,
                    "label": clean(t.merchant or t.description),
                    "category": categories.get(t.category_id) if t.category_id else None,
                    "reasons": reasons,
                    "duplicate": twin is not None,
                }
            )
    return found


def unusual(ctx: Ctx, fresh: Fresh) -> list[Message]:
    items = [i for i in unusual_purchases(ctx.db, ctx.today) if fresh(i["key"])]
    if not items:
        return []
    items.sort(key=lambda i: i["amount"], reverse=True)
    main, others = items[0], items[1:]
    t = main["txn"]
    account = t.account.name if t.account else "Conta"
    if main["duplicate"] and len(main["reasons"]) == 1:
        subject = f"Cobrança repetida? {brl(main['amount'])} em {main['label']}"
    else:
        subject = f"Compra fora do seu padrão: {brl(main['amount'])} em {main['label']}"
    total_subject = f"Compra fora do seu padrão: {brl(main['amount'])}"
    blocks: list = [
        P(
            "O último sync trouxe uma compra que foge da sua rotina."
            if not others
            else f"O último sync trouxe {len(items)} compras que fogem da sua rotina."
        ),
        Hero(f"{clean(account)} · {t.date:%d/%m}, {main['label']}", main["amount"], private=True),
        Hero(f"{clean(account)} · {t.date:%d/%m}", main["amount"], totals_only=True),
        Rows([Row("Por quê", r) for r in main["reasons"]]),
    ]
    if t.installment_total:
        blocks[-1].rows.append(Row("Parcelado", f"{t.installment_total}x de {brl(-t.amount)}"))
    if others:
        blocks.append(Heading("Também neste sync"))
        blocks.append(
            Rows(
                [
                    Row(
                        f"{o['label']} ({o['txn'].date:%d/%m}): {o['reasons'][0]}", brl(o["amount"])
                    )
                    for o in others
                ],
                private=True,
            )
        )
        blocks.append(
            P(f"Mais {len(others)} compra(s) fora do padrão neste sync.", totals_only=True)
        )
    blocks.append(
        P(
            "Se não reconhece alguma delas, bloqueie o cartão no app do banco e fale com ele. "
            "O Finora só lê as contas: não consegue bloquear nada."
        )
    )
    return [
        Message(
            kind="unusual",
            keys=[i["key"] for i in items],
            subject=subject,
            totals_subject=total_subject,
            preheader="; ".join(main["reasons"]).capitalize() + ". Foi você?",
            blocks=blocks,
            cta_path="/transacoes",
            discreet_subject="Uma compra fora do seu padrão",
            discreet_text=(
                "O último sync trouxe uma compra que foge da sua rotina. Confira no Finora."
            ),
        )
    ]


# --- por novidade --------------------------------------------------------------------------


def _top_in_category(ctx: Ctx, category_id: int, limit: int = 3) -> list[tuple[str, Decimal, int]]:
    ids = analytics.transaction_ids_in_cycle(ctx.db, ctx.key, ctx.cyc)
    totals: dict[str, Decimal] = defaultdict(lambda: ZERO)
    counts: dict[str, int] = defaultdict(int)
    for t in ctx.db.scalars(
        select(Transaction).where(Transaction.id.in_(ids), Transaction.category_id == category_id)
    ):
        if t.amount < 0:
            name = clean(t.merchant or t.description)
            totals[name] -= t.amount
            counts[name] += 1
    top = sorted(totals.items(), key=lambda kv: kv[1], reverse=True)[:limit]
    return [(name, value, counts[name]) for name, value in top]


_LEVEL_ORDER = {"budget100": 0, "budget80": 1, "spike": 2}


def category(ctx: Ctx, fresh: Fresh) -> list[Message]:
    found = []
    for c in analytics.categories_breakdown(ctx.db, ctx.key):
        spent, budget = c["spent"], c["budget"]
        if budget and spent > budget:
            level = "budget100"
        elif budget and spent >= budget * Decimal("0.8"):
            level = "budget80"
        elif c["anomaly"] and not budget:
            level = "spike"
        else:
            continue
        key = f"category:{level}:{ctx.key}:{c['category_id']}"
        if fresh(key):
            found.append((level, key, c))
    if not found:
        return []
    found.sort(key=lambda x: _LEVEL_ORDER[x[0]])
    days = ctx.forecast["days_left"]
    mes = month_name(ctx.key)
    blocks: list = []
    facts: dict[str, str] = {"dias para o fim do ciclo": str(days)}
    for level, _, c in found:
        name, spent, budget = c["category_name"], c["spent"], c["budget"]
        if level == "spike":
            blocks.append(Heading(f"{name}: bem acima da média"))
            blocks.append(
                Rows(
                    [
                        Row("Neste ciclo", brl(spent), "neg", strong=True),
                        Row("Média dos 3 ciclos anteriores", brl(c["average"])),
                    ]
                )
            )
        else:
            title = "passou do orçamento" if level == "budget100" else "chegou a 80% do orçamento"
            blocks.append(Heading(f"{name} {title}"))
            blocks.append(
                Bar(
                    brl(spent),
                    f"orçamento {brl(budget)}",
                    float(spent / budget),
                    "neg" if level == "budget100" else "warn",
                )
            )
            if c.get("average"):
                blocks.append(Rows([Row("Média dos 3 ciclos anteriores", brl(c["average"]))]))
        if c["category_id"] is not None:
            top = _top_in_category(ctx, c["category_id"])
            if top:
                blocks.append(
                    Rows(
                        [Row(f"{n} ({k} compra{'s' if k > 1 else ''})", brl(v)) for n, v, k in top],
                        private=True,
                    )
                )
                facts[f"maior gasto em {name}"] = f"{top[0][0]}, {brl(top[0][1])}"
        facts[f"gasto em {name}"] = brl(spent)
        if budget:
            facts[f"orçamento de {name}"] = brl(budget)
        if c.get("average"):
            facts[f"média de {name}"] = brl(c["average"])
    blocks.append(Say(""))
    level, _, first = found[0]
    name = first["category_name"]
    if level == "budget100":
        subject = f"{name} passou do orçamento de {mes}"
        pre = f"{brl(first['spent'])} de {brl(first['budget'])}, faltando {days} dias"
    elif level == "budget80":
        subject = f"{name} já usou {pct(first['spent'] / first['budget'])} do orçamento"
        pre = f"{brl(first['spent'])} de {brl(first['budget'])}, faltando {days} dias"
    else:
        subject = f"{name} está bem acima do normal neste ciclo"
        pre = f"{brl(first['spent'])}; a média é {brl(first['average'])}"
    if len(found) > 1:
        pre += f". E mais {len(found) - 1} área(s)."
    return [
        Message(
            kind="category",
            keys=[k for _, k, _ in found],
            subject=subject,
            preheader=pre,
            blocks=[P(f"Faltam {days} dias para o ciclo de {mes} fechar."), *blocks],
            cta_path="/orcamentos",
            discreet_subject="Uma área de gastos passou do normal",
            discreet_text="Uma categoria de gastos passou do limite ou da média. Veja no Finora.",
            facts=facts,
        )
    ]


def wish(ctx: Ctx, fresh: Fresh) -> list[Message]:
    items = list(
        ctx.db.scalars(
            select(WishItem)
            .options(selectinload(WishItem.prices))
            .where(WishItem.status == WishStatus.WANTED)
        )
    )
    if not items:
        return []
    aff = affordability.context(ctx.db, ctx.today)
    found = []
    for item in items:
        ev = affordability.evaluate(item.price, aff)
        keys = []
        if ev["veredito"] == "cabe":
            keys.append(f"wish:fits:{item.id}:{ctx.key}")
        target = item.target_price is not None and item.price <= item.target_price
        if target:
            keys.append(f"wish:target:{item.id}:{item.target_price}")
        keys = [k for k in keys if fresh(k)]
        if keys:
            found.append((item, ev, target, keys))
    if not found:
        return []
    blocks: list = []
    for item, ev, target, _ in found:
        first = item.prices[0].price if item.prices else None
        note = None
        if first and first > item.price:
            note = f"Era {brl(first)} quando você adicionou (−{pct((first - item.price) / first)})."
        if target:
            note = (note + " " if note else "") + f"Seu preço-alvo era {brl(item.target_price)}."
        label = item.name + (f" · {item.store}" if item.store else "")
        blocks.append(Hero(label, item.price, note, private=True))
        blocks.append(Hero("Um desejo da sua lista", item.price, totals_only=True))
        tone = "ok" if ev["veredito"] == "cabe" else "info"
        blocks.append(Box(tone, ev["titulo"] + ".", ev["motivo"]))
    item, ev, target, _ = found[0]
    if len(found) > 1:
        subject = f"{len(found)} desejos da sua lista estão ao seu alcance"
    elif ev["veredito"] == "cabe":
        subject = f"{item.name} da sua lista cabe neste ciclo"
    else:
        subject = f"{item.name} chegou ao seu preço-alvo"
    return [
        Message(
            kind="wish",
            keys=[k for *_, keys in found for k in keys],
            subject=subject,
            totals_subject="Um desejo da sua lista ficou ao seu alcance",
            preheader=f"{brl(item.price)}. {ev['titulo']}.",
            blocks=[
                P(
                    "Um desejo da lista ficou ao seu alcance."
                    if len(found) == 1
                    else "Alguns desejos da lista ficaram ao seu alcance."
                ),
                *blocks,
                P("É a mesma conta do botão “Dá para comprar?” da lista de desejos."),
            ],
            cta_path="/desejos",
            discreet_subject="Um desejo da sua lista ficou ao seu alcance",
            discreet_text="Um item da lista de desejos cabe no orçamento agora. Veja no Finora.",
        )
    ]


_PRICE_RATIO = Decimal("1.10")
_PRICE_MIN = Decimal("5")


def price_up(ctx: Ctx, fresh: Fresh) -> list[Message]:
    rows = analytics._rows(ctx.db, ctx.cyc, shift_key(ctx.key, -4), ctx.key)
    recurring = analytics.recurring(ctx.db, ctx.today, cyc=ctx.cyc)
    last: dict[str, analytics.Row] = {}
    for r in rows:
        if r.kind == CategoryKind.EXPENSE and r.amount < 0:
            k = analytics._normalize(r.label)
            if k not in last or r.posted > last[k].posted:
                last[k] = r
    found = []
    for item in recurring:
        row = last.get(item["key"])
        if row is None or row.posted < ctx.today - UNUSUAL_WINDOW:
            continue
        paid, usual = -row.amount, item["monthly_amount"]
        key = f"price_up:{item['key']}:{row.posted}"
        if paid >= usual * _PRICE_RATIO and paid - usual >= _PRICE_MIN and fresh(key):
            found.append((clean(item["name"]), paid, usual, key))
    if not found:
        return []
    blocks: list = []
    for name, paid, usual, _ in found:
        blocks.append(Heading(name))
        blocks.append(
            Rows(
                [
                    Row("Última cobrança", brl(paid), "neg", strong=True),
                    Row("O normal, por ciclo", brl(usual)),
                    Row("A mais em um ano, se continuar", brl((paid - usual) * 12), "neg"),
                ]
            )
        )
    name, paid, usual, _ = found[0]
    return [
        Message(
            kind="price_up",
            keys=[k for *_, k in found],
            subject=f"{name} ficou mais caro: {brl(paid)}",
            totals_subject="Uma conta fixa ficou mais cara",
            preheader=f"O normal era {brl(usual)} por ciclo.",
            blocks=[P("Uma conta que se repete veio acima do normal."), *blocks],
            discreet_subject="Uma conta fixa ficou mais cara",
            discreet_text="Uma assinatura ou conta fixa veio acima do normal. Veja no Finora.",
        )
    ]


def installment_end(ctx: Ctx, fresh: Fresh) -> list[Message]:
    found = [
        i
        for i in analytics.installments(ctx.db)
        if i["remaining"] == 1 and fresh(f"installment_end:{i['name']}:{i['last_month']}")
    ]
    if not found:
        return []
    total = sum((i["installment_amount"] for i in found), ZERO)
    blocks: list = [
        Rows(
            [
                Row(
                    f"{clean(i['name'])} ({i['total']}x)",
                    f"{brl(i['installment_amount'])} por ciclo",
                )
                for i in found
            ],
            private=True,
        ),
        Box("ok", "A partir do próximo ciclo,", f"ficam livres {brl(total)} por ciclo."),
    ]
    first = found[0]
    return [
        Message(
            kind="installment_end",
            keys=[f"installment_end:{i['name']}:{i['last_month']}" for i in found],
            subject=(
                f"Última parcela de {clean(first['name'])}: libera {brl(total)} por ciclo"
                if len(found) == 1
                else f"{len(found)} compras na última parcela: liberam {brl(total)} por ciclo"
            ),
            totals_subject=f"Parcelas terminando: liberam {brl(total)} por ciclo",
            preheader="Depois desta parcela, esse valor volta para o seu dia a dia.",
            blocks=[P("Uma compra parcelada está na última parcela."), *blocks],
            discreet_subject="Uma compra parcelada está terminando",
            discreet_text="Uma compra parcelada está na última parcela. Veja no Finora.",
        )
    ]


def cycle_red(ctx: Ctx, fresh: Fresh) -> list[Message]:
    f = ctx.forecast
    key = f"cycle_red:{ctx.key}"
    if f["forecast_end"] >= 0 or f["days_left"] < 1 or not fresh(key):
        return []
    mes = month_name(ctx.key)
    rows = [Row("Seu ritmo típico, por dia", brl(f["daily_typical"]), "neg")]
    if f["daily_allowance"] is not None and f["daily_allowance"] > 0:
        rows.append(
            Row("Para fechar guardando a meta, por dia", brl(f["daily_allowance"]), strong=True)
        )
    return [
        Message(
            kind="cycle_red",
            keys=[key],
            subject=f"No ritmo atual, o ciclo de {mes} não fecha a conta",
            preheader=f"Faltariam {brl(-f['forecast_end'])} para guardar a meta.",
            blocks=[
                P(f"Faltam {f['days_left']} dias para o ciclo de {mes} fechar."),
                Hero("No ritmo atual, faltam para fechar guardando a meta", -f["forecast_end"]),
                Rows(rows),
                Say(""),
            ],
            discreet_subject=f"Atenção ao ciclo de {mes}",
            discreet_text="No ritmo atual, o ciclo não fecha a conta. Veja a previsão no Finora.",
            facts={
                "falta no fim do ciclo": brl(-f["forecast_end"]),
                "ritmo típico por dia": brl(f["daily_typical"]),
                "dá para gastar por dia": brl(f["daily_allowance"] or ZERO),
                "dias para o fim": str(f["days_left"]),
            },
        )
    ]


_STATUS_TEXT = {
    ConnectionStatus.LOGIN_ERROR: "o banco pediu login de novo",
    ConnectionStatus.OUTDATED: "a conexão ficou desatualizada",
    ConnectionStatus.WAITING_USER_INPUT: "o banco está esperando uma confirmação sua",
}


def bank(ctx: Ctx, fresh: Fresh) -> list[Message]:
    found = []
    bucket = ctx.today.toordinal() // 3
    for c in ctx.db.scalars(select(Connection)):
        problem = _STATUS_TEXT.get(c.status)
        synced = c.last_synced_at
        if synced is not None and synced.tzinfo is None:
            synced = synced.replace(tzinfo=ctx.now.tzinfo)
        if problem is None and synced is not None and ctx.now - synced >= STALE_BANK:
            problem = f"sem sincronizar desde {synced:%d/%m}"
        key = f"bank:{c.id}:{bucket}"
        if problem and fresh(key):
            found.append((c, problem, key))
    if not found:
        return []
    first = found[0][0]
    return [
        Message(
            kind="bank",
            keys=[k for *_, k in found],
            subject=(
                f"{first.institution_name} precisa de atenção no Finora"
                if len(found) == 1
                else f"{len(found)} bancos precisam de atenção no Finora"
            ),
            preheader="Enquanto isso, as transações novas não chegam.",
            blocks=[
                Rows([Row(c.institution_name, problem, "warn") for c, problem, _ in found]),
                P(
                    "Enquanto a conexão não volta, as transações novas não chegam e os avisos "
                    "ficam incompletos. Abra Contas e reconecte o banco."
                ),
            ],
            cta_path="/contas",
            discreet_subject="Um banco precisa de atenção no Finora",
            discreet_text="Uma conexão com banco precisa ser refeita. Abra Contas no Finora.",
        )
    ]


RULES: dict[str, Callable[[Ctx, Fresh], list[Message]]] = {
    "cycle_ending": cycle_ending,
    "cycle_closed": cycle_closed,
    "mid_cycle": mid_cycle,
    "card_due": card_due,
    "unusual": unusual,
    "category": category,
    "wish": wish,
    "price_up": price_up,
    "installment_end": installment_end,
    "cycle_red": cycle_red,
    "bank": bank,
}
