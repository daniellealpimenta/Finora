from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.db.models import Account, AccountType, Category, Connection, Transaction
from app.services import sync as sync_module
from app.services.categories import ensure_categories, pluggy_category_key
from app.services.sync import sync_all


def tx(id_, amount, type_, category_id=None, date_="2026-10-05T03:00:00.000Z", **extra):
    return {
        "id": id_,
        "description": extra.pop("description", f"Compra {id_}"),
        "amount": amount,
        "type": type_,
        "date": date_,
        "status": extra.pop("status", "POSTED"),
        "categoryId": category_id,
        "category": None,
        **extra,
    }


class FakePluggy:
    def __init__(self, accounts, transactions):
        self.accounts = accounts
        self.transactions = transactions  # {account_id: [tx, ...]}
        self.date_from = None

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        pass

    def get_item(self, item_id):
        return {"id": item_id, "status": "UPDATED", "connector": {"name": "Banco Teste"}}

    def list_accounts(self, item_id):
        return self.accounts

    def iter_transactions(self, account_id, date_from=None, date_to=None):
        self.date_from = date_from
        return iter(self.transactions.get(account_id, []))


CHECKING = {
    "id": "acc-cc",
    "type": "BANK",
    "subtype": "CHECKING_ACCOUNT",
    "name": "Conta Corrente",
    "balance": 1500.5,
    "currencyCode": "BRL",
}
CARD = {
    "id": "acc-card",
    "type": "CREDIT",
    "subtype": "CREDIT_CARD",
    "name": "Cartão",
    "balance": 800,
    "currencyCode": "BRL",
    "creditData": {"creditLimit": 5000},
}


@pytest.fixture
def connection(db):
    ensure_categories(db)
    conn = Connection(external_id="item-1", institution_name="?", status="UPDATING")
    db.add(conn)
    db.commit()
    return conn


def use_fake(monkeypatch, fake):
    monkeypatch.setattr(sync_module, "PluggyClient", lambda: fake)


def by_ext(db):
    return {t.external_id: t for t in db.scalars(select(Transaction))}


def cat_key(db, t):
    return db.get(Category, t.category_id).key if t.category_id else None


def test_pluggy_category_mapping():
    assert pluggy_category_key("10000000", is_credit=False) == "groceries"
    assert pluggy_category_key("19050001", is_credit=False) == "fuel"
    assert pluggy_category_key("19050002", is_credit=False) == "vehicle"
    assert pluggy_category_key("05100000", is_credit=False) == "card_payment"
    assert pluggy_category_key("05090004", is_credit=False) == "transfers_out"
    assert pluggy_category_key("05090004", is_credit=True) == "transfers_in"
    assert pluggy_category_key("200300000", is_credit=False) == "insurance"
    assert pluggy_category_key(None, is_credit=False) is None


def test_first_sync_normalizes_and_categorizes(db, connection, monkeypatch):
    fake = FakePluggy(
        [CHECKING, CARD],
        {
            "acc-cc": [
                tx("t1", -120.0, "DEBIT", "10000000"),  # supermercado
                tx("t2", 5000, "CREDIT", "01010000"),  # salário
                tx("t3", -700, "DEBIT", "05100000"),  # pagamento de fatura
            ],
            "acc-card": [
                # No cartão a compra vem com amount positivo, mas type DEBIT
                tx(
                    "c1",
                    300,
                    "DEBIT",
                    "11020000",
                    creditCardMetadata={"installmentNumber": 2, "totalInstallments": 3},
                ),
                tx("c2", 700, "CREDIT", "05100000"),  # pagamento recebido no cartão
            ],
        },
    )
    use_fake(monkeypatch, fake)

    result = sync_all(db)

    assert result.errors == []
    assert (result.connections, result.accounts, result.created) == (1, 2, 5)
    accounts = {a.external_id: a for a in db.scalars(select(Account))}
    assert accounts["acc-cc"].type == AccountType.CHECKING
    assert accounts["acc-cc"].balance == Decimal("1500.50")
    assert accounts["acc-card"].balance == Decimal("-800")
    assert accounts["acc-card"].credit_limit == Decimal("5000")

    t = by_ext(db)
    assert t["t1"].amount == Decimal("-120") and cat_key(db, t["t1"]) == "groceries"
    assert t["t1"].date == date(2026, 10, 5)  # 03:00Z = meia-noite em Brasília
    assert t["t2"].amount == Decimal("5000") and cat_key(db, t["t2"]) == "salary"
    assert t["c1"].amount == Decimal("-300") and cat_key(db, t["c1"]) == "delivery"
    assert (t["c1"].installment_number, t["c1"].installment_total) == (2, 3)
    assert t["t3"].is_transfer and t["c2"].is_transfer
    assert db.get(Connection, connection.id).institution_name == "Banco Teste"


def test_resync_updates_deletes_and_keeps_manual_category(db, connection, monkeypatch):
    first = FakePluggy(
        [CHECKING],
        {
            "acc-cc": [
                tx("t1", -50, "DEBIT", "10000000", status="PENDING"),
                tx("t2", -80, "DEBIT", "11010000"),
                tx("t3", -20, "DEBIT", "99999999"),
            ]
        },
    )
    use_fake(monkeypatch, first)
    sync_all(db)

    # Usuário recategoriza t2 manualmente
    leisure = db.scalar(select(Category).where(Category.key == "leisure"))
    t2 = by_ext(db)["t2"]
    t2.category_id, t2.user_categorized = leisure.id, True
    db.commit()

    second = FakePluggy(
        [CHECKING],
        {
            "acc-cc": [
                tx("t1", -50, "DEBIT", "10000000", status="POSTED"),
                tx("t2", -80, "DEBIT", "11010000"),
                # t3 sumiu (a Pluggy apagou/recriou com novo id)
                tx("t3b", -20, "DEBIT", "99999999"),
            ]
        },
    )
    use_fake(monkeypatch, second)
    result = sync_all(db)

    t = by_ext(db)
    assert set(t) == {"t1", "t2", "t3b"}
    assert t["t1"].status == "POSTED"
    assert cat_key(db, t["t2"]) == "leisure"
    assert (result.created, result.updated, result.deleted) == (1, 2, 1)
    # Segundo sync usa janela curta (último sync - 30 dias), não 12 meses
    assert (date.today() - second.date_from).days <= 31


def test_sync_error_is_recorded_per_connection(db, connection, monkeypatch):
    class Broken(FakePluggy):
        def get_item(self, item_id):
            raise RuntimeError("item expirado")

    use_fake(monkeypatch, Broken([], {}))
    result = sync_all(db)
    assert len(result.errors) == 1
    assert "item expirado" in db.get(Connection, connection.id).last_sync_error


def test_recategorize_with_rule_applies_to_similar(
    client, db, connection, auth_headers, monkeypatch
):
    fake = FakePluggy(
        [CHECKING],
        {
            "acc-cc": [
                tx("a", -30, "DEBIT", "99999999", description="PADARIA DO ZE 123"),
                tx("b", -12, "DEBIT", "99999999", description="Padaria do Ze 456"),
                tx("c", -99, "DEBIT", "99999999", description="Outra loja"),
            ]
        },
    )
    use_fake(monkeypatch, fake)
    sync_all(db)
    t = by_ext(db)
    eating_out = db.scalar(select(Category).where(Category.key == "eating_out"))

    resp = client.patch(
        f"/transactions/{t['a'].id}",
        json={"category_id": eating_out.id, "create_rule": True, "rule_pattern": "padaria do ze"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["category_name"] == "Restaurantes e bares"

    db.expire_all()
    t = by_ext(db)
    assert cat_key(db, t["b"]) == "eating_out"
    assert cat_key(db, t["c"]) == "other"

    # Próximo sync respeita a regra para transações novas
    fake.transactions["acc-cc"].append(
        tx("d", -8, "DEBIT", "99999999", description="PADARIA DO ZE 789")
    )
    sync_all(db)
    assert cat_key(db, by_ext(db)["d"]) == "eating_out"

    listing = client.get("/transactions", headers=auth_headers, params={"q": "padaria"}).json()
    assert listing["total"] == 3
    assert Decimal(listing["expense"]) == Decimal("-50")


def test_card_with_inverted_convention_is_detected(db, connection, monkeypatch):
    # Formato observado no sandbox da Pluggy: compras como CREDIT com valor negativo
    card_txs = [
        tx("n1", -55.9, "CREDIT", "09020000"),
        tx("n2", -21.9, "CREDIT", "09030000"),
        tx("n3", -89.9, "CREDIT", "07030001"),
        tx("p1", 300, "DEBIT", "05100000"),  # pagamento da fatura
    ]
    use_fake(monkeypatch, FakePluggy([CARD], {"acc-card": card_txs}))
    sync_all(db)
    t = by_ext(db)
    assert t["n1"].amount == Decimal("-55.9")
    assert t["n3"].amount == Decimal("-89.9")
    assert t["p1"].amount == Decimal("300") and t["p1"].is_transfer


def test_rule_matches_merchant_name_on_sync(db, connection, monkeypatch):
    from app.db.models import CategoryRule

    leisure = db.scalar(select(Category).where(Category.key == "leisure"))
    db.add(CategoryRule(pattern="Netflix Entretenimento", category_id=leisure.id))
    db.commit()
    netflix = tx(
        "nf",
        -55.9,
        "DEBIT",
        "09020000",
        description="NETFLIX.COM",
        merchant={"businessName": "NETFLIX ENTRETENIMENTO BRASIL LTDA."},
    )
    use_fake(monkeypatch, FakePluggy([CHECKING], {"acc-cc": [netflix]}))
    sync_all(db)
    assert cat_key(db, by_ext(db)["nf"]) == "leisure"
