from datetime import date
from decimal import Decimal

from app.db.models import Account, AccountType, Connection, Transaction, TransactionSource


def test_connections_show_bank_and_newest_transaction(client, db, auth_headers):
    """Pelo MeuPluggy a conexão não diz o banco; a conta corrente diz. A data da transação mais
    recente deixa o app avisar quando um banco parou de mandar dados."""
    conn = Connection(external_id="item-1", institution_name="MeuPluggy", status="UPDATED")
    checking = Account(
        external_id="acc-1", connection=conn, name="Nu Pagamentos S.A.", type=AccountType.CHECKING
    )
    card = Account(external_id="acc-2", connection=conn, name="gold", type=AccountType.CREDIT_CARD)
    db.add_all([conn, checking, card])
    db.flush()
    for i, day in enumerate([date(2026, 10, 2), date(2026, 10, 10)]):
        db.add(
            Transaction(
                account_id=checking.id,
                external_id=f"t{i}",
                source=TransactionSource.PLUGGY,
                date=day,
                amount=Decimal("-10"),
                description="Mercado",
            )
        )
    db.commit()

    accounts = client.get("/connections", headers=auth_headers).json()[0]["accounts"]
    by_name = {a["name"]: a for a in accounts}
    assert by_name["Nu Pagamentos S.A."]["last_transaction_date"] == "2026-10-10"
    assert by_name["Nu Pagamentos S.A."]["bank"] == "Nubank"
    assert by_name["gold"]["last_transaction_date"] is None
    assert by_name["gold"]["bank"] == "Nubank"


def test_panel_layout_is_saved(client, auth_headers):
    assert client.get("/panel", headers=auth_headers).json() == {"layout": None}
    layout = {
        "order": ["hero", "bills"],
        "hidden": [],
        "sizes": {"bills": 3},
        "views": {},
        "tried": [],
    }
    assert client.put("/panel", json={"layout": layout}, headers=auth_headers).status_code == 204
    assert client.get("/panel", headers=auth_headers).json() == {"layout": layout}
    big = {"order": ["x" * 30_000]}
    assert client.put("/panel", json={"layout": big}, headers=auth_headers).status_code == 413
    assert client.put("/panel", json={"layout": None}, headers=auth_headers).status_code == 204
    assert client.get("/panel", headers=auth_headers).json() == {"layout": None}
