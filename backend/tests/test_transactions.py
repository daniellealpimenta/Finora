from datetime import date
from decimal import Decimal

from sqlalchemy import select

from app.db.models import Account, AccountType, Category, Transaction, TransactionSource
from app.services.categories import ensure_categories


def _setup(db):
    ensure_categories(db)
    cat = {c.key: c.id for c in db.scalars(select(Category))}
    conta = Account(name="Conta", type=AccountType.CHECKING, balance=Decimal("0"))
    outra = Account(name="Outra", type=AccountType.CHECKING, balance=Decimal("0"))
    db.add_all([conta, outra])
    db.flush()
    rows = [
        (conta, date(2026, 9, 5), "-100", "groceries", "MERCADO A"),
        (conta, date(2026, 9, 6), "20", "groceries", "ESTORNO MERCADO A"),
        (conta, date(2026, 10, 5), "-50", "groceries", "MERCADO B"),
        (outra, date(2026, 10, 7), "-30", "transport", "UBER"),
        (conta, date(2026, 10, 8), "5000", "salary", "SALARIO"),  # entrada: fora dos cards
        (conta, date(2026, 10, 9), "-700", "card_payment", "FATURA"),  # transferência: fora
    ]
    for i, (acc, d, amount, key, desc) in enumerate(rows):
        db.add(
            Transaction(
                account_id=acc.id,
                external_id=f"t{i}",
                source=TransactionSource.MANUAL,
                date=d,
                amount=Decimal(amount),
                description=desc,
                category_id=cat[key],
            )
        )
    db.commit()
    return conta, outra


def test_spend_by_category_follows_list_filters(client, db, auth_headers):
    conta, _ = _setup(db)

    def get(**params):
        resp = client.get("/transactions/by-category", params=params, headers=auth_headers)
        assert resp.status_code == 200, resp.text
        return {r["category_name"]: (r["spent"], r["count"]) for r in resp.json()}

    # Todos os ciclos: o estorno abate o mercado; entradas e transferências ficam fora
    assert get() == {"Supermercado": (130.0, 3), "Transporte": (30.0, 1)}
    assert get(month="2026-10") == {"Supermercado": (50.0, 1), "Transporte": (30.0, 1)}
    assert get(account_id=conta.id) == {"Supermercado": (130.0, 3)}
    assert get(q="uber") == {"Transporte": (30.0, 1)}
