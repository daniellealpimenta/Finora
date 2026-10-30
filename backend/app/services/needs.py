"""Jogo "Precisava ou foi vontade?" e o índice que sai dele.

Cada gasto do ciclo vira uma carta; o usuário joga para "precisava" ou "foi vontade"
(`Transaction.need`). Com isso dá para medir quanto do ciclo foi escolha, onde a vontade mais
pesa e quanto sobraria cortando metade dela.
"""

from collections import defaultdict
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Category, CategoryKind, Transaction
from app.services import analytics
from app.services import cycles as cycle_service
from app.services.cycles import shift_key

ZERO = Decimal("0")
HISTORY = 6  # ciclos no gráfico de evolução


def _expenses(db: Session, key: str, cyc=None) -> list[tuple[Transaction, Category | None]]:
    """Gastos do ciclo que viram carta: saídas de categoria de despesa (ou sem categoria),
    sem transferências entre contas."""
    ids = analytics.transaction_ids_in_cycle(db, key, cyc)
    if not ids:
        return []
    query = (
        select(Transaction, Category)
        .join(Category, Transaction.category_id == Category.id, isouter=True)
        .where(Transaction.id.in_(ids), Transaction.amount < 0, Transaction.is_transfer.is_(False))
    )
    return [(t, c) for t, c in db.execute(query) if c is None or c.kind == CategoryKind.EXPENSE]


def deck(db: Session, key: str) -> list[dict]:
    """As cartas do ciclo: primeiro as que faltam classificar, as maiores na frente."""
    cards = [
        {
            "id": t.id,
            "date": t.date,
            "label": t.merchant or t.description,
            "description": t.description,
            "amount": -t.amount,
            "category_name": c.name if c else "Sem categoria",
            "category_key": c.key if c else None,
            "need": t.need,
        }
        for t, c in _expenses(db, key)
    ]
    return sorted(cards, key=lambda x: (x["need"] is not None, -x["amount"]))


def _totals(rows: list[tuple[Transaction, Category | None]]) -> dict:
    need = want = open_ = ZERO
    for t, _ in rows:
        if t.need is True:
            need -= t.amount
        elif t.need is False:
            want -= t.amount
        else:
            open_ -= t.amount
    classified = need + want
    return {
        "need": need,
        "want": want,
        "open": open_,
        "want_share": float(want / classified) if classified > 0 else None,
    }


def summary(db: Session, key: str) -> dict:
    cyc = cycle_service.load(db)
    rows = _expenses(db, key, cyc)
    totals = _totals(rows)

    by_category: dict[str, Decimal] = defaultdict(lambda: ZERO)
    by_label: dict[str, Decimal] = defaultdict(lambda: ZERO)
    for t, c in rows:
        if t.need is False:
            by_category[c.name if c else "Sem categoria"] -= t.amount
            by_label[t.merchant or t.description] -= t.amount

    def top(d: dict[str, Decimal]) -> list[dict]:
        ranked = sorted(d.items(), key=lambda kv: kv[1], reverse=True)[:3]
        return [{"name": n, "amount": v} for n, v in ranked]

    history = []
    for back in range(HISTORY - 1, -1, -1):
        k = shift_key(key, -back)
        h = totals if back == 0 else _totals(_expenses(db, k, cyc))
        history.append({"key": k, "want_share": h["want_share"], "want": h["want"]})
    previous = history[-2]["want_share"] if len(history) > 1 else None

    return {
        **totals,
        "count": len(rows),
        "open_count": sum(1 for t, _ in rows if t.need is None),
        "previous_want_share": previous,
        # Cortando metade da vontade, isto ficaria no bolso a cada ciclo
        "half_want": (totals["want"] / 2).quantize(Decimal("0.01")),
        "top_categories": top(by_category),
        "top_merchants": top(by_label),
        "history": history,
    }
