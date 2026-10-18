"""Estatísticas e índices financeiros, por ciclo de fatura (app/services/cycles.py).

Convenções (valem para todos os cálculos):
- Período = ciclo: do dia seguinte a um fechamento da fatura do cartão principal até o
  fechamento seguinte. A chave é o mês em que ele começa ("2026-09" = 09/09 a 08/10).
- Lançamentos de conta contam na própria data; compras no cartão, no ciclo em que a fatura
  delas fecha (como no app do banco). Parcelas contam no ciclo da fatura em que entram.
- Despesa = transações em categorias EXPENSE, líquidas de estornos (entradas na mesma
  categoria abatem o gasto). Sem categoria: saída conta como despesa, entrada como receita.
- Receita = transações em categorias INCOME.
- Categorias TRANSFER (entre contas próprias, pagamento de fatura, investimentos) ficam
  fora de receita e despesa: senão a fatura do cartão seria contada duas vezes.

`cycle_flow` é a conta do ciclo como o usuário a faz: começou com (o que estava livre),
mais o que entrou, menos o que saiu pela conta, a fatura do ciclo e o que foi guardado.
"""

import re
import statistics
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import (
    Account,
    AccountType,
    Budget,
    Category,
    CategoryKind,
    Investment,
    Transaction,
    TransactionStatus,
)
from app.services import cards as card_service
from app.services import cycles as cycle_service
from app.services.cycles import ONE_DAY, Cycles, shift_key
from app.services.periods import add_months, month_key

ZERO = Decimal("0")
LIQUID_ACCOUNTS = (AccountType.CHECKING, AccountType.SAVINGS)
# Compras de cartão podem ser de antes do ciclo em que a fatura delas fecha
_CARD_LOOKBACK = timedelta(days=100)


@dataclass
class Row:
    """Transação já classificada e posta no seu ciclo."""

    date: date  # dentro do ciclo (compra anterior ao ciclo vem para o primeiro dia)
    posted: date  # data original do lançamento
    cycle: str
    amount: Decimal
    label: str  # estabelecimento ou descrição
    category_id: int | None
    category_name: str
    kind: CategoryKind  # EXPENSE/INCOME/TRANSFER efetivo
    status: TransactionStatus
    category_key: str | None = None
    installment: bool = False  # parcela de compra parcelada


def _rows(db: Session, cyc: Cycles, first: str, last: str | None = None) -> list[Row]:
    """Transações dos ciclos `first` a `last` (inclusive)."""
    last = last or first
    start, end = cyc.bounds(first)[0], cyc.bounds(last)[1]
    query = (
        select(Transaction, Category)
        .join(Category, Transaction.category_id == Category.id, isouter=True)
        .where(Transaction.date >= start - _CARD_LOOKBACK, Transaction.date < end)
    )
    rows = []
    for t, c in db.execute(query):
        key, when = cyc.place(t.account_id, t.date, cycle_service.bill_id_of(t.raw))
        if not first <= key <= last:
            continue
        if c is not None:
            kind, name = c.kind, c.name
        else:
            kind = CategoryKind.INCOME if t.amount > 0 else CategoryKind.EXPENSE
            name = "Sem categoria"
        label = t.merchant or t.description
        rows.append(
            Row(
                when,
                t.date,
                key,
                t.amount,
                label,
                t.category_id,
                name,
                kind,
                t.status,
                category_key=c.key if c else None,
                installment=(t.installment_total or 0) > 1,
            )
        )
    return rows


def transaction_ids_in_cycle(db: Session, key: str, cyc: Cycles | None = None) -> set[int]:
    """Transações do ciclo, pela mesma regra das análises (lista de Transações)."""
    cyc = cyc or cycle_service.load(db)
    start, end = cyc.bounds(key)
    query = select(Transaction.id, Transaction.account_id, Transaction.date, Transaction.raw).where(
        Transaction.date >= start - _CARD_LOOKBACK, Transaction.date < end
    )
    return {
        tx_id
        for tx_id, account_id, d, raw in db.execute(query)
        if cyc.place(account_id, d, cycle_service.bill_id_of(raw))[0] == key
    }


def _expense(rows: list[Row]) -> Decimal:
    return -sum((r.amount for r in rows if r.kind == CategoryKind.EXPENSE), ZERO)


def _income(rows: list[Row]) -> Decimal:
    return sum((r.amount for r in rows if r.kind == CategoryKind.INCOME), ZERO)


def _ratio(num: Decimal, den: Decimal) -> float | None:
    return float(num / den) if den > 0 else None


def cycle_info(cyc: Cycles, key: str, today: date) -> dict:
    start, end = cyc.bounds(key)
    return {
        "key": key,
        "start": start,
        "end": end - ONE_DAY,  # último dia (inclusive)
        "is_current": start <= today < end,
        "current_key": cyc.key_of(today),
        "reference_card": cyc.reference.name if cyc.reference else None,
    }


def current_cycle(db: Session, today: date, key: str | None = None) -> dict:
    cyc = cycle_service.load(db)
    return cycle_info(cyc, key or cyc.key_of(today), today)


# --- fluxo por ciclo -------------------------------------------------------------


def cashflow(db: Session, end_key: str, months: int = 12, cyc: Cycles | None = None) -> list[dict]:
    """Receita, despesa e diferença de cada ciclo, terminando em `end_key` (inclusive)."""
    cyc = cyc or cycle_service.load(db)
    keys = [shift_key(end_key, i - (months - 1)) for i in range(months)]
    by_cycle: dict[str, list[Row]] = defaultdict(list)
    for r in _rows(db, cyc, keys[0], keys[-1]):
        by_cycle[r.cycle].append(r)
    result = []
    for key in keys:
        income, expense = _income(by_cycle[key]), _expense(by_cycle[key])
        result.append({"month": key, "income": income, "expense": expense, "net": income - expense})
    return result


def _average(db: Session, cyc: Cycles, key: str, field: str, cycles: int = 3) -> Decimal:
    """Média de receita ou despesa dos `cycles` ciclos anteriores a `key` que têm dados."""
    flows = cashflow(db, shift_key(key, -1), cycles, cyc)
    with_data = [f[field] for f in flows if f[field] > 0]
    return sum(with_data, ZERO) / len(with_data) if with_data else ZERO


# --- recorrentes (assinaturas e contas fixas) -------------------------------------


def _normalize(label: str) -> str:
    text = label.casefold()
    text = re.sub(r"\d+/\d+", " ", text)  # parcelas "3/10"
    text = re.sub(r"[\d*#.\-_/]+", " ", text)  # números, códigos
    return re.sub(r"\s+", " ", text).strip()


def recurring(db: Session, today: date, lookback: int = 6, cyc: Cycles | None = None) -> list[dict]:
    """Detecta gastos que se repetem todo ciclo com valor parecido.

    Critério: mesmo estabelecimento/descrição normalizada em >= 3 ciclos distintos da
    janela, com pelo menos um nos últimos 2 ciclos (ainda ativo) e valores dentro de
    ±25% da mediana. Parcelamentos ficam de fora (são compromissos com fim).
    """
    cyc = cyc or cycle_service.load(db)
    current = cyc.key_of(today)
    groups: dict[str, list[Row]] = defaultdict(list)
    for r in _rows(db, cyc, shift_key(current, -(lookback - 1)), current):
        if r.kind == CategoryKind.EXPENSE and r.amount < 0 and not r.installment:
            groups[_normalize(r.label)].append(r)

    recent = {current, shift_key(current, -1)}
    found = []
    for key, rows in groups.items():
        if not key:
            continue
        seen = {r.cycle for r in rows}
        if len(seen) < 3 or not seen & recent:
            continue
        # Um valor por ciclo (soma), para tolerar duas cobranças no mesmo ciclo
        per_cycle: dict[str, Decimal] = defaultdict(lambda: ZERO)
        for r in rows:
            per_cycle[r.cycle] += -r.amount
        values = list(per_cycle.values())
        median = statistics.median(values)
        if median <= 0 or any(abs(v - median) > median * Decimal("0.25") for v in values):
            continue
        last = max(rows, key=lambda r: r.posted)
        found.append(
            {
                "key": key,
                "name": last.label,
                "category_name": last.category_name,
                "monthly_amount": median.quantize(Decimal("0.01")),
                "annual_amount": (median * 12).quantize(Decimal("0.01")),
                "months_seen": len(seen),
                "last_date": last.posted,
            }
        )
    return sorted(found, key=lambda x: x["monthly_amount"], reverse=True)


# --- a conta do ciclo ---------------------------------------------------------------


def _liquid_balance_at(db: Session, liquid_now: Decimal, d: date) -> Decimal:
    """Saldo das contas no começo do dia `d`: o de hoje menos o que entrou e saiu desde `d`."""
    since = db.scalar(
        select(func.coalesce(func.sum(Transaction.amount), 0))
        .join(Account, Transaction.account_id == Account.id)
        .where(Account.type.in_(LIQUID_ACCOUNTS), Transaction.date >= d)
    )
    return liquid_now - Decimal(str(since))


def _unpaid_at(bills: list[dict], d: date) -> Decimal:
    """Faturas já fechadas antes de `d` e ainda não pagas no começo de `d`, menos as pagas
    antes mesmo de fechar (esse dinheiro já saiu da conta, mas a fatura é do ciclo seguinte)."""
    total = ZERO
    for b in bills:
        if b["status"] == "open" or b["close_date"] is None:
            continue
        paid_before = b["paid_at"] is not None and b["paid_at"] < d
        if b["close_date"] >= d:
            if paid_before:
                total -= b["charges"]
            continue
        # Paga sem data conhecida (fatura antiga ou zerada): já estava paga
        settled = paid_before or (b["status"] == "paid" and b["paid_at"] is None)
        if not settled:
            total += b["charges"]
    return total


def cycle_flow(
    db: Session, cyc: Cycles, key: str, today: date, card_list: list[dict], liquid_now: Decimal
) -> dict:
    """Começou com + entrou − gastos pela conta − faturas do ciclo − guardado = terminou com.

    "Começou com" é o dinheiro livre no início do ciclo: saldo das contas menos as faturas
    já fechadas e ainda não pagas. Nos ciclos encerrados, `check` confere o "terminou com"
    contra o saldo real do fim do ciclo; diferença indica movimento fora das contas
    conectadas.
    """
    start, end = cyc.bounds(key)
    query = (
        select(Transaction.amount, Category.kind, Category.key)
        .join(Account, Transaction.account_id == Account.id)
        .join(Category, Transaction.category_id == Category.id, isouter=True)
        .where(
            Account.type.in_(LIQUID_ACCOUNTS),
            Transaction.date >= start,
            Transaction.date < end,
        )
    )
    income = spent = saved = other = paid_bills = ZERO
    for amount, kind, cat_key in db.execute(query):
        if cat_key == "card_payment":
            paid_bills -= amount  # usado só sem faturas conhecidas (abaixo)
            continue
        if kind is None:
            kind = CategoryKind.INCOME if amount > 0 else CategoryKind.EXPENSE
        if cat_key == "investments":
            saved -= amount
        elif kind == CategoryKind.INCOME:
            income += amount
        elif kind == CategoryKind.EXPENSE:
            spent -= amount
        else:
            other += amount

    all_bills = [{**b, "bank": c["bank"]} for c in card_list for b in c["bills"]]
    if cyc.reference is not None:
        # A fatura entra pelo valor dela, no ciclo em que fecha (não quando é paga)
        bills = [b for b in all_bills if b["competence"] == key]
        # O que as faturas do ciclo custaram (as compras), não o saldo que o banco cobra
        card_bills = sum((b["charges"] for b in bills), ZERO)
    else:
        # Sem faturas conhecidas (cartão por OFX, banco sem /bills): vale o que foi pago
        bills, card_bills = [], paid_bills
    started = _liquid_balance_at(db, liquid_now, start) - _unpaid_at(all_bills, start)
    result = income - spent - card_bills - saved + other
    ended = started + result

    check = None
    if end <= today:
        balance = _liquid_balance_at(db, liquid_now, end)
        unpaid = _unpaid_at(all_bills, end)
        check = {
            "balance": balance,
            "unpaid_bills": unpaid,
            "free": balance - unpaid,
            "difference": balance - unpaid - ended,
        }
    return {
        "started_with": started,
        "income": income,
        "spent": spent,
        "card_bills": card_bills,
        "bills": [
            {
                "bank": b["bank"],
                "status": b["status"],
                "amount": b["charges"],
                "close_date": b["close_date"],
                "due_date": b["due_date"],
            }
            for b in sorted(bills, key=lambda b: b["charges"], reverse=True)
        ],
        "saved": saved,
        "other": other,
        "result": result,
        "ended_with": ended,
        "check": check,
    }


# --- resumo do ciclo -----------------------------------------------------------------


def _health_score(
    savings_rate: float | None, reserve_months: float | None, commitment: float | None
) -> dict:
    """0-100: poupança (40), reserva de emergência (30), comprometimento fixo (30)."""
    savings_pts = 40 * min(max((savings_rate or 0) / 0.20, 0), 1)
    reserve_pts = 30 * min(max((reserve_months or 0) / 6, 0), 1)
    if commitment is None:
        commitment_pts = 15.0  # sem receita para comparar: neutro
    else:
        commitment_pts = 30 * min(max((0.70 - commitment) / 0.40, 0), 1)
    return {
        "score": round(savings_pts + reserve_pts + commitment_pts),
        "savings_points": round(savings_pts, 1),
        "reserve_points": round(reserve_pts, 1),
        "commitment_points": round(commitment_pts, 1),
    }


def summary(db: Session, key: str, today: date) -> dict:
    cyc = cycle_service.load(db)
    start, end = cyc.bounds(key)
    rows = _rows(db, cyc, key)
    income, expense = _income(rows), _expense(rows)
    previous = shift_key(key, -1)
    prev_rows = _rows(db, cyc, previous)
    prev_income, prev_expense = _income(prev_rows), _expense(prev_rows)

    accounts = list(db.scalars(select(Account)))
    liquid = sum((a.balance for a in accounts if a.type in LIQUID_ACCOUNTS), ZERO)
    card_list = card_service.cards(db, today, cyc)
    # Faturas a pagar (aberta + fechadas não pagas). O saldo do cartão na Pluggy é o limite
    # usado, que inclui parcelas futuras: não é o que vence agora.
    unpaid = card_service.unpaid_bills(card_list)
    card_debt = sum((b["amount"] for b in unpaid), ZERO)
    # Caixinhas e cofrinhos: dinheiro guardado, fora do que está livre para gastar
    invested = sum((i.balance for i in db.scalars(select(Investment))), ZERO)

    avg_expense = _average(db, cyc, key, "expense")
    avg_income = _average(db, cyc, key, "income")
    # Para ciclos passados, os recorrentes são avaliados no último dia daquele ciclo
    recurring_items = recurring(db, min(today, end - ONE_DAY), cyc=cyc)
    fixed_monthly = sum((r["monthly_amount"] for r in recurring_items), ZERO)

    # Projeção (só no ciclo atual): gastos fixos entram uma vez no ciclo, e só o gasto
    # variável é extrapolado pelos dias. Extrapolar tudo linearmente exageraria
    # (aluguel e contas costumam cair no começo).
    projected = None
    if start <= today < end:
        days = (end - start).days
        elapsed = (today - start).days + 1
        fixed_keys = {r["key"] for r in recurring_items}
        so_far = [r for r in rows if r.date <= today]
        variable = _expense([r for r in so_far if _normalize(r.label) not in fixed_keys])
        projected = max(fixed_monthly + variable / elapsed * days, _expense(so_far)).quantize(
            Decimal("0.01")
        )

    flow = cycle_flow(db, cyc, key, today, card_list, liquid)
    previous_flow = cycle_flow(db, cyc, previous, today, card_list, liquid)
    savings_rate = _ratio(income - expense, income)
    reserve_months = _ratio(liquid + invested, avg_expense)
    commitment = _ratio(fixed_monthly, avg_income or income)

    return {
        "month": key,
        "cycle": cycle_info(cyc, key, today),
        "income": income,
        "expense": expense,
        "net": income - expense,
        "previous_income": prev_income,
        "previous_expense": prev_expense,
        "savings_rate": savings_rate,
        "flow": flow,
        "previous_result": previous_flow["result"],
        "projected_expense": projected,
        "liquid_balance": liquid,
        "card_debt": card_debt,
        "invested": invested,
        # O que está em conta hoje menos as faturas a pagar
        "available_now": liquid - card_debt,
        "next_bill_due": unpaid[0]["due_date"] if unpaid else None,
        "next_bill_amount": unpaid[0]["amount"] if unpaid else None,
        "avg_monthly_expense": avg_expense,
        "avg_monthly_income": avg_income,
        "emergency_reserve_months": reserve_months,
        "fixed_monthly": fixed_monthly,
        "fixed_commitment": commitment,
        "health": _health_score(savings_rate, reserve_months, commitment),
    }


# --- categorias, orçamentos e anomalias ---------------------------------------------


def effective_budgets(db: Session, month_start: date) -> dict[int, Decimal]:
    """Orçamento vigente por categoria: o mais recente definido até este ciclo.

    Um orçamento definido em março continua valendo nos ciclos seguintes até ser
    alterado. Limite 0 significa "sem orçamento".
    """
    budgets: dict[int, Budget] = {}
    for b in db.scalars(select(Budget).where(Budget.month <= month_start).order_by(Budget.month)):
        budgets[b.category_id] = b
    return {cid: b.limit_amount for cid, b in budgets.items() if b.limit_amount > 0}


def categories_breakdown(db: Session, key: str) -> list[dict]:
    """Gasto por categoria no ciclo, média dos 3 ciclos anteriores e alerta de anomalia."""
    cyc = cycle_service.load(db)
    start, _ = cyc.bounds(key)
    current: dict[int | None, Decimal] = defaultdict(lambda: ZERO)
    names: dict[int | None, str] = {}
    for r in _rows(db, cyc, key):
        if r.kind == CategoryKind.EXPENSE:
            current[r.category_id] -= r.amount
            names[r.category_id] = r.category_name

    # Média dos 3 ciclos anteriores, dividindo pelos ciclos que têm algum dado
    # (quem começou a usar há 1 ciclo não fica com média artificialmente baixa)
    past_total: dict[int | None, Decimal] = defaultdict(lambda: ZERO)
    past = _rows(db, cyc, shift_key(key, -3), shift_key(key, -1))
    cycles_with_data = len({r.cycle for r in past})
    for r in past:
        if r.kind == CategoryKind.EXPENSE:
            past_total[r.category_id] -= r.amount
            names.setdefault(r.category_id, r.category_name)

    # Orçamentos são guardados pelo mês em que o ciclo começa (dia 1º)
    budgets = effective_budgets(db, date(start.year, start.month, 1))
    result = []
    for cid in set(current) | set(budgets):
        spent = current.get(cid, ZERO)
        avg = past_total.get(cid, ZERO) / cycles_with_data if cycles_with_data else ZERO
        # Anomalia: 50% acima da média e pelo menos R$ 100 a mais (só com histórico)
        anomaly = (
            cycles_with_data > 0
            and spent - avg >= 100
            and (avg == 0 or spent >= avg * Decimal("1.5"))
        )
        if cid not in names and cid is not None:
            category = db.get(Category, cid)
            names[cid] = category.name if category else "?"
        result.append(
            {
                "category_id": cid,
                "category_name": names.get(cid, "Sem categoria"),
                "spent": spent,
                "average": avg.quantize(Decimal("0.01")),
                "change": _ratio(spent - avg, avg),
                "anomaly": bool(anomaly),
                "budget": budgets.get(cid),
            }
        )
    return sorted(result, key=lambda x: x["spent"], reverse=True)


# --- gasto diário, estabelecimentos, parcelas futuras ---------------------------


def daily(db: Session, key: str) -> list[dict]:
    """Gasto acumulado dia a dia no ciclo e no ciclo anterior (para comparar o ritmo)."""
    cyc = cycle_service.load(db)
    previous = shift_key(key, -1)

    def cumulative(k: str) -> list[Decimal]:
        start, end = cyc.bounds(k)
        per_day: dict[int, Decimal] = defaultdict(lambda: ZERO)
        for r in _rows(db, cyc, k):
            if r.kind == CategoryKind.EXPENSE:
                per_day[(r.date - start).days] -= r.amount
        acc, out = ZERO, []
        for d in range((end - start).days):
            acc += per_day.get(d, ZERO)
            out.append(acc)
        return out

    start, _ = cyc.bounds(key)
    cur, prev = cumulative(key), cumulative(previous)
    return [
        {
            "day": i + 1,
            "date": start + timedelta(days=i),
            "current": cur[i],
            "previous": prev[i] if i < len(prev) else None,
        }
        for i in range(len(cur))
    ]


def top_merchants(db: Session, key: str, limit: int = 10) -> list[dict]:
    cyc = cycle_service.load(db)
    totals: dict[str, Decimal] = defaultdict(lambda: ZERO)
    counts: dict[str, int] = defaultdict(int)
    for r in _rows(db, cyc, key):
        if r.kind == CategoryKind.EXPENSE and r.amount < 0:
            totals[r.label] -= r.amount
            counts[r.label] += 1
    ranked = sorted(totals.items(), key=lambda kv: kv[1], reverse=True)[:limit]
    return [{"name": name, "total": total, "count": counts[name]} for name, total in ranked]


def future_commitments(db: Session, today: date, months: int = 6) -> list[dict]:
    """Compras já feitas que entram nos próximos ciclos (parcelas e lançamentos futuros)."""
    cyc = cycle_service.load(db)
    keys = [shift_key(cyc.key_of(today), i) for i in range(months + 1)]
    totals: dict[str, Decimal] = defaultdict(lambda: ZERO)
    for r in _rows(db, cyc, keys[0], keys[-1]):
        if r.posted > today and r.status == TransactionStatus.PENDING and r.amount < 0:
            if r.kind == CategoryKind.EXPENSE:
                totals[r.cycle] -= r.amount
    return [{"month": k, "amount": totals.get(k, ZERO)} for k in keys]


# --- parcelamentos ---------------------------------------------------------------------

_INSTALLMENT_MARK = re.compile(r"\s*(parc(ela)?\.?\s*)?\d{1,2}\s*/\s*\d{1,2}\b", re.IGNORECASE)


def installments(db: Session) -> list[dict]:
    """Compras parceladas ainda em andamento: quantas parcelas foram, quantas faltam.

    Cada parcela chega como uma transação ("LOJA 2/6"); agrupamos por conta + descrição
    sem o "2/6" + total de parcelas. Pagas = maior número já lançado (POSTED); a parcela
    da fatura aberta chega PENDING e ainda conta como a pagar. Bancos datam as parcelas de
    jeitos diferentes (mês de cada fatura, ou todas na data da compra), então o mês final
    é uma estimativa.
    """
    query = (
        select(Transaction, Account, Category)
        .join(Account, Transaction.account_id == Account.id)
        .join(Category, Transaction.category_id == Category.id, isouter=True)
        .where(Transaction.installment_total > 1)
    )
    groups: dict[tuple, list[tuple[Transaction, Account, Category | None]]] = defaultdict(list)
    for t, a, c in db.execute(query):
        if c is not None and c.kind != CategoryKind.EXPENSE:
            continue
        key = (a.id, _normalize(t.merchant or t.description), t.installment_total)
        groups[key].append((t, a, c))

    result = []
    for (_, _, total), rows in groups.items():
        # Parcela n lançada = n pagas; parcela n na fatura aberta (PENDING) = n - 1 pagas
        progress = [
            (t.installment_number or 0) - (0 if t.status == TransactionStatus.POSTED else 1)
            for t, _, _ in rows
        ]
        paid = min(max(max(progress), 0), total)
        remaining = total - paid
        if remaining <= 0:
            continue
        latest_tx, account, category = max(
            rows, key=lambda r: (r[0].installment_number or 0, r[0].date)
        )
        first_tx = min(rows, key=lambda r: r[0].installment_number or 0)[0]
        # Datas diferentes por parcela = datadas pela fatura: volta até a 1ª parcela. Com
        # uma parcela só não dá para saber; datar pela fatura é o mais comum.
        dated_per_bill = len(rows) == 1 or len({t.date for t, _, _ in rows}) > 1
        first_month = date(first_tx.date.year, first_tx.date.month, 1)
        if dated_per_bill:
            first_month = add_months(first_month, -((first_tx.installment_number or 1) - 1))
        amount = abs(latest_tx.amount)
        label = latest_tx.merchant or latest_tx.description
        result.append(
            {
                "name": _INSTALLMENT_MARK.sub("", label).strip() or label,
                "account_name": account.name,
                "category_id": category.id if category else None,
                "category_name": category.name if category else "Sem categoria",
                "installment_amount": amount,
                "total": total,
                "paid": paid,
                "remaining": remaining,
                "remaining_amount": (amount * remaining).quantize(Decimal("0.01")),
                "first_month": month_key(first_month),
                "last_month": month_key(add_months(first_month, total - 1)),
            }
        )
    return sorted(result, key=lambda x: x["remaining_amount"], reverse=True)
