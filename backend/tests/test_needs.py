from datetime import date
from decimal import Decimal

from sqlalchemy import select

from app.db.models import Account, AccountType, Category, Transaction, TransactionSource
from app.services.categories import ensure_categories


def _setup(db):
    ensure_categories(db)
    cat = {c.key: c.id for c in db.scalars(select(Category))}
    conta = Account(name="Conta", type=AccountType.CHECKING, balance=Decimal("0"))
    db.add(conta)
    db.flush()
    rows = [
        (date(2026, 9, 10), "-80", "delivery", "PIZZA SETEMBRO"),
        (date(2026, 10, 5), "-300", "groceries", "MERCADO"),
        (date(2026, 10, 6), "-120", "delivery", "IFOOD"),
        (date(2026, 10, 7), "-30", "transport", "UBER"),
        (date(2026, 10, 8), "5000", "salary", "SALARIO"),  # entrada: não vira carta
        (date(2026, 10, 9), "-700", "card_payment", "FATURA"),  # transferência: não vira carta
    ]
    ids = {}
    for i, (d, amount, key, desc) in enumerate(rows):
        t = Transaction(
            account_id=conta.id,
            external_id=f"n{i}",
            source=TransactionSource.MANUAL,
            date=d,
            amount=Decimal(amount),
            description=desc,
            category_id=cat[key],
        )
        db.add(t)
        db.flush()
        ids[desc] = t.id
    db.commit()
    return ids


def test_deck_has_only_cycle_expenses_biggest_first(client, db, auth_headers):
    _setup(db)
    deck = client.get("/needs/deck?month=2026-10", headers=auth_headers).json()
    assert [c["label"] for c in deck] == ["MERCADO", "IFOOD", "UBER"]
    assert deck[0]["amount"] == 300
    assert all(c["need"] is None for c in deck)


def test_playing_cards_builds_the_index(client, db, auth_headers):
    ids = _setup(db)

    def play(desc, need, month="2026-10"):
        res = client.put(
            f"/transactions/{ids[desc]}/need", json={"need": need}, headers=auth_headers
        )
        assert res.status_code == 204

    play("MERCADO", True)
    play("IFOOD", False)
    play("PIZZA SETEMBRO", False)

    s = client.get("/needs/summary?month=2026-10", headers=auth_headers).json()
    assert (s["need"], s["want"], s["open"]) == (300, 120, 30)
    assert s["want_share"] == 120 / 420
    assert s["open_count"] == 1
    assert s["half_want"] == 60
    assert s["top_merchants"][0] == {"name": "IFOOD", "amount": 120}
    assert s["previous_want_share"] == 1.0  # setembro: só a pizza, toda vontade
    assert len(s["history"]) == 6

    # Classificada sai da frente do baralho
    deck = client.get("/needs/deck?month=2026-10", headers=auth_headers).json()
    assert deck[0]["label"] == "UBER"

    play("IFOOD", None)  # desfaz
    s = client.get("/needs/summary?month=2026-10", headers=auth_headers).json()
    assert s["want"] == 0


def test_need_unknown_transaction(client, auth_headers):
    res = client.put("/transactions/999/need", json={"need": True}, headers=auth_headers)
    assert res.status_code == 404


def test_wish_jar_fills_and_never_goes_negative(client, auth_headers):
    item = client.post(
        "/wishlist/items", json={"name": "Tênis", "price": 400}, headers=auth_headers
    ).json()
    assert float(item["saved"]) == 0
    res = client.post(
        f"/wishlist/items/{item['id']}/jar", json={"amount": 50}, headers=auth_headers
    )
    assert float(res.json()["saved"]) == 50
    res = client.post(
        f"/wishlist/items/{item['id']}/jar", json={"amount": -80}, headers=auth_headers
    )
    assert float(res.json()["saved"]) == 0
