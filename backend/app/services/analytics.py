"""Estatísticas e índices financeiros.

Convenções (valem para todos os cálculos):
- Despesa = transações em categorias EXPENSE, líquidas de estornos (entradas na mesma
  categoria abatem o gasto). Sem categoria: saída conta como despesa, entrada como receita.
- Receita = transações em categorias INCOME.
- Categorias TRANSFER (entre contas próprias, pagamento de fatura, investimentos) ficam
  fora de receita e despesa: senão a fatura do cartão seria contada duas vezes.
- Compras pendentes (fatura aberta, parcelas futuras) contam no mês da sua data.
"""

import calendar
import re
import statistics
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
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
from app.services.periods import add_months, month_bounds, month_key

ZERO = Decimal("0")
LIQUID_ACCOUNTS = (AccountType.CHECKING, AccountType.SAVINGS)


@dataclass
class Row:
    """Transação já classificada para análise."""

    date: date
    amount: Decimal
    label: str  # estabelecimento ou descrição
    category_id: int | None
    category_name: str
    kind: CategoryKind  # EXPENSE/INCOME/TRANSFER efetivo
    status: TransactionStatus


def _rows(db: Session, start: date, end: date) -> list[Row]:
    query = (
        select(Transaction, Category)
        .join(Category, Transaction.category_id == Category.id, isouter=True)
        .where(Transaction.date >= start, Transaction.date < end)
    )
    rows = []
    for t, c in db.execute(query):
        if c is not None:
            kind, name = c.kind, c.name
        else:
            kind = CategoryKind.INCOME if t.amount > 0 else CategoryKind.EXPENSE
            name = "Sem categoria"
        rows.append(
            Row(t.date, t.amount, t.merchant or t.description, t.category_id, name, kind, t.status)
        )
    return rows


def _expense(rows: list[Row]) -> Decimal:
    return -sum((r.amount for r in rows if r.kind == CategoryKind.EXPENSE), ZERO)


def _income(rows: list[Row]) -> Decimal:
    return sum((r.amount for r in rows if r.kind == CategoryKind.INCOME), ZERO)


def _ratio(num: Decimal, den: Decimal) -> float | None:
    return float(num / den) if den > 0 else None


# --- fluxo de caixa -----------------------------------------------------------


def cashflow(db: Session, end_month: str, months: int = 12) -> list[dict]:
    """Receita, despesa e saldo de cada mês, terminando em `end_month` (inclusive)."""
    last_start, _ = month_bounds(end_month)
    first = add_months(last_start, -(months - 1))
    by_month: dict[str, list[Row]] = defaultdict(list)
    for r in _rows(db, first, add_months(last_start, 1)):
        by_month[month_key(r.date)].append(r)
    result = []
    for i in range(months):
        key = month_key(add_months(first, i))
        income, expense = _income(by_month[key]), _expense(by_month[key])
        result.append({"month": key, "income": income, "expense": expense, "net": income - expense})
    return result


def _avg_expense(db: Session, before: date, months: int = 3) -> Decimal:
    """Média de despesa mensal dos `months` meses completos antes de `before` (dia 1)."""
    flows = cashflow(db, month_key(add_months(before, -1)), months)
    with_data = [f["expense"] for f in flows if f["expense"] > 0]
    return sum(with_data, ZERO) / len(with_data) if with_data else ZERO


def _avg_income(db: Session, before: date, months: int = 3) -> Decimal:
    flows = cashflow(db, month_key(add_months(before, -1)), months)
    with_data = [f["income"] for f in flows if f["income"] > 0]
    return sum(with_data, ZERO) / len(with_data) if with_data else ZERO


# --- recorrentes (assinaturas e contas fixas) -------------------------------------


def _normalize(label: str) -> str:
    text = label.casefold()
    text = re.sub(r"\d+/\d+", " ", text)  # parcelas "3/10"
    text = re.sub(r"[\d*#.\-_/]+", " ", text)  # números, códigos
    return re.sub(r"\s+", " ", text).strip()


def recurring(db: Session, today: date, lookback_months: int = 6) -> list[dict]:
    """Detecta gastos que se repetem todo mês com valor parecido.

    Critério: mesmo estabelecimento/descrição normalizada em >= 3 meses distintos da
    janela, com pelo menos um nos últimos 2 meses (ainda ativo) e valores dentro de
    ±25% da mediana. Parcelamentos ficam de fora (são compromissos com fim).
    """
    current = date(today.year, today.month, 1)
    start = add_months(current, -(lookback_months - 1))
    groups: dict[str, list[Row]] = defaultdict(list)
    for r in _rows(db, start, add_months(current, 1)):
        if r.kind == CategoryKind.EXPENSE and r.amount < 0:
            groups[_normalize(r.label)].append(r)

    recent = {month_key(current), month_key(add_months(current, -1))}
    found = []
    for key, rows in groups.items():
        if not key:
            continue
        months = {month_key(r.date) for r in rows}
        if len(months) < 3 or not months & recent:
            continue
        # Um valor por mês (soma), para tolerar duas cobranças no mesmo mês
        per_month: dict[str, Decimal] = defaultdict(lambda: ZERO)
        for r in rows:
            per_month[month_key(r.date)] += -r.amount
        values = list(per_month.values())
        median = statistics.median(values)
        if median <= 0 or any(abs(v - median) > median * Decimal("0.25") for v in values):
            continue
        last = max(rows, key=lambda r: r.date)
        found.append(
            {
                "key": key,
                "name": last.label,
                "category_name": last.category_name,
                "monthly_amount": median.quantize(Decimal("0.01")),
                "annual_amount": (median * 12).quantize(Decimal("0.01")),
                "months_seen": len(months),
                "last_date": last.date,
            }
        )
    return sorted(found, key=lambda x: x["monthly_amount"], reverse=True)


# --- resumo do mês -------------------------------------------------------------------


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


def summary(db: Session, month: str, today: date) -> dict:
    start, end = month_bounds(month)
    rows = _rows(db, start, end)
    income, expense = _income(rows), _expense(rows)
    prev_rows = _rows(db, add_months(start, -1), start)
    prev_income, prev_expense = _income(prev_rows), _expense(prev_rows)

    accounts = list(db.scalars(select(Account)))
    liquid = sum((a.balance for a in accounts if a.type in LIQUID_ACCOUNTS), ZERO)
    cards = [a for a in accounts if a.type == AccountType.CREDIT_CARD]
    card_debt = -sum((a.balance for a in cards), ZERO)
    # Caixinhas e cofrinhos: dinheiro guardado, fora do que está livre para gastar
    invested = sum((i.balance for i in db.scalars(select(Investment))), ZERO)
    # Próxima fatura a vencer (a mais próxima de hoje entre os cartões com saldo devedor)
    upcoming = sorted(
        (a for a in cards if a.bill_due_date and a.bill_due_date >= today and a.balance < 0),
        key=lambda a: a.bill_due_date,
    )

    avg_expense = _avg_expense(db, start)
    avg_income = _avg_income(db, start)
    # Para meses passados, os recorrentes são avaliados no último dia daquele mês
    recurring_items = recurring(db, min(today, end - timedelta(days=1)))
    fixed_monthly = sum((r["monthly_amount"] for r in recurring_items), ZERO)

    # Projeção (só no mês corrente): gastos fixos entram uma vez no mês, e só o gasto
    # variável é extrapolado pelos dias. Extrapolar tudo linearmente exageraria
    # (aluguel e contas costumam cair no começo do mês).
    projected = None
    if start <= today < end:
        days_in_month = calendar.monthrange(start.year, start.month)[1]
        fixed_keys = {r["key"] for r in recurring_items}
        so_far = [r for r in rows if r.date <= today]
        variable = _expense([r for r in so_far if _normalize(r.label) not in fixed_keys])
        projected = max(
            fixed_monthly + variable / today.day * days_in_month, _expense(so_far)
        ).quantize(Decimal("0.01"))

    savings_rate = _ratio(income - expense, income)
    reserve_months = _ratio(liquid + invested, avg_expense)
    commitment = _ratio(fixed_monthly, avg_income or income)

    return {
        "month": month,
        "income": income,
        "expense": expense,
        "net": income - expense,
        "previous_income": prev_income,
        "previous_expense": prev_expense,
        "savings_rate": savings_rate,
        "projected_expense": projected,
        "liquid_balance": liquid,
        "card_debt": card_debt,
        "invested": invested,
        # Regime de caixa: o que está em conta hoje menos o que já é devido no cartão
        "available_now": liquid - card_debt,
        "next_bill_due": upcoming[0].bill_due_date if upcoming else None,
        "next_bill_amount": -upcoming[0].balance if upcoming else None,
        "avg_monthly_expense": avg_expense,
        "avg_monthly_income": avg_income,
        "emergency_reserve_months": reserve_months,
        "fixed_monthly": fixed_monthly,
        "fixed_commitment": commitment,
        "health": _health_score(savings_rate, reserve_months, commitment),
    }


# --- categorias, orçamentos e anomalias ---------------------------------------------


def effective_budgets(db: Session, month_start: date) -> dict[int, Decimal]:
    """Orçamento vigente por categoria: o mais recente definido até este mês.

    Um orçamento definido em março continua valendo nos meses seguintes até ser
    alterado. Limite 0 significa "sem orçamento".
    """
    budgets: dict[int, Budget] = {}
    for b in db.scalars(select(Budget).where(Budget.month <= month_start).order_by(Budget.month)):
        budgets[b.category_id] = b
    return {cid: b.limit_amount for cid, b in budgets.items() if b.limit_amount > 0}


def categories_breakdown(db: Session, month: str) -> list[dict]:
    """Gasto por categoria no mês, média dos 3 meses anteriores e alerta de anomalia."""
    start, end = month_bounds(month)
    current: dict[int | None, Decimal] = defaultdict(lambda: ZERO)
    names: dict[int | None, str] = {}
    for r in _rows(db, start, end):
        if r.kind == CategoryKind.EXPENSE:
            current[r.category_id] -= r.amount
            names[r.category_id] = r.category_name

    # Média dos 3 meses anteriores, dividindo pelos meses que têm algum dado
    # (quem começou a usar há 1 mês não fica com média artificialmente baixa)
    past_total: dict[int | None, Decimal] = defaultdict(lambda: ZERO)
    months_with_data = 0
    for i in range(1, 4):
        m_start = add_months(start, -i)
        month_rows = _rows(db, m_start, add_months(m_start, 1))
        if month_rows:
            months_with_data += 1
        for r in month_rows:
            if r.kind == CategoryKind.EXPENSE:
                past_total[r.category_id] -= r.amount
                names.setdefault(r.category_id, r.category_name)

    budgets = effective_budgets(db, start)
    result = []
    for cid in set(current) | set(budgets):
        spent = current.get(cid, ZERO)
        avg = past_total.get(cid, ZERO) / months_with_data if months_with_data else ZERO
        # Anomalia: 50% acima da média e pelo menos R$ 100 a mais (só com histórico)
        anomaly = (
            months_with_data > 0
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


def daily(db: Session, month: str) -> list[dict]:
    """Gasto acumulado dia a dia no mês e no mês anterior (para comparar o ritmo)."""
    start, end = month_bounds(month)
    prev_start = add_months(start, -1)

    def cumulative(s: date, e: date) -> list[Decimal]:
        per_day: dict[int, Decimal] = defaultdict(lambda: ZERO)
        for r in _rows(db, s, e):
            if r.kind == CategoryKind.EXPENSE:
                per_day[r.date.day] -= r.amount
        days = calendar.monthrange(s.year, s.month)[1]
        acc, out = ZERO, []
        for d in range(1, days + 1):
            acc += per_day.get(d, ZERO)
            out.append(acc)
        return out

    cur, prev = cumulative(start, end), cumulative(prev_start, start)
    return [
        {"day": i + 1, "current": cur[i], "previous": prev[i] if i < len(prev) else None}
        for i in range(len(cur))
    ]


def top_merchants(db: Session, month: str, limit: int = 10) -> list[dict]:
    start, end = month_bounds(month)
    totals: dict[str, Decimal] = defaultdict(lambda: ZERO)
    counts: dict[str, int] = defaultdict(int)
    for r in _rows(db, start, end):
        if r.kind == CategoryKind.EXPENSE and r.amount < 0:
            totals[r.label] -= r.amount
            counts[r.label] += 1
    ranked = sorted(totals.items(), key=lambda kv: kv[1], reverse=True)[:limit]
    return [{"name": name, "total": total, "count": counts[name]} for name, total in ranked]


def future_commitments(db: Session, today: date, months: int = 6) -> list[dict]:
    """Compras já feitas que vencem nos próximos meses (parcelas e lançamentos futuros)."""
    start = date(today.year, today.month, 1)
    end = add_months(start, months + 1)
    totals: dict[str, Decimal] = defaultdict(lambda: ZERO)
    for r in _rows(db, today, end):
        if r.date > today and r.status == TransactionStatus.PENDING and r.amount < 0:
            if r.kind == CategoryKind.EXPENSE:
                totals[month_key(r.date)] -= r.amount
    return [
        {
            "month": month_key(add_months(start, i)),
            "amount": totals.get(month_key(add_months(start, i)), ZERO),
        }
        for i in range(months + 1)
    ]


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
