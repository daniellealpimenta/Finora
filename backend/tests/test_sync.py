from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.db.models import (
    Account,
    AccountType,
    Category,
    Connection,
    Investment,
    SavingsPot,
    Transaction,
)
from app.integrations.pluggy.client import PluggyError
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
    def __init__(self, accounts, transactions, investments=None):
        self.accounts = accounts
        self.transactions = transactions  # {account_id: [tx, ...]}
        self.investments = investments or []
        self.date_from = None

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        pass

    def get_item(self, item_id):
        return {"id": item_id, "status": "UPDATED", "connector": {"name": "Banco Teste"}}

    def list_accounts(self, item_id):
        return self.accounts

    def list_investments(self, item_id):
        return list(self.investments)

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


CAIXINHA = {
    "id": "inv-1",
    "name": "Caixinha Reserva",
    "type": "FIXED_INCOME",
    "subtype": "CDB",
    "balance": 2100.5,
    "currencyCode": "BRL",
    "status": "ACTIVE",
    "issuer": "PICPAY INSTITUICAO DE PAGAMENTO S/A",
    "rate": 110,
    "rateType": "CDI",
    "amountOriginal": 2000.0000000001,
    "purchaseDate": "2026-09-10T03:00:00.000Z",
    "dueDate": "2029-09-09T03:00:00.000Z",
}


def test_sync_brings_cofrinhos_and_card_bill_dates(db, connection, monkeypatch):
    card = {
        **CARD,
        "creditData": {
            "creditLimit": 5000,
            "balanceDueDate": "2026-10-20T03:00:00.000Z",
            "balanceCloseDate": "2026-10-13T03:00:00.000Z",
        },
    }
    resgatado = {**CAIXINHA, "id": "inv-2", "balance": 0, "status": "TOTAL_WITHDRAWAL"}
    fake = FakePluggy([CHECKING, card], {}, investments=[CAIXINHA, resgatado])
    use_fake(monkeypatch, fake)

    result = sync_all(db)

    assert result.errors == [] and result.investments == 1
    inv = db.scalar(select(Investment))
    assert (inv.name, inv.subtype, inv.balance) == ("Caixinha Reserva", "CDB", Decimal("2100.50"))
    card_account = db.scalar(select(Account).where(Account.external_id == "acc-card"))
    assert card_account.bill_due_date == date(2026, 10, 20)
    assert card_account.bill_close_date == date(2026, 10, 13)

    # A meta é do usuário: o sync atualiza o saldo e não mexe nela
    inv.goal_amount = Decimal("5000")
    db.commit()
    fake.investments = [{**CAIXINHA, "balance": 2200}]
    sync_all(db)
    inv = db.scalar(select(Investment))
    assert (inv.balance, inv.goal_amount) == (Decimal("2200"), Decimal("5000"))

    # Sumiu da Pluggy (resgatado, encerrado): sai daqui também
    fake.investments = []
    sync_all(db)
    assert db.scalar(select(Investment)) is None


def test_investments_unavailable_keeps_existing_and_syncs_the_rest(db, connection, monkeypatch):
    use_fake(monkeypatch, FakePluggy([CHECKING], {}, investments=[CAIXINHA]))
    sync_all(db)

    class NoInvestments(FakePluggy):
        def list_investments(self, item_id):
            raise PluggyError("GET /investments -> 403: produto não contratado")

    use_fake(monkeypatch, NoInvestments([CHECKING], {"acc-cc": [tx("t1", -50, "DEBIT")]}))
    result = sync_all(db)

    assert result.errors == [] and result.created == 1
    assert db.scalar(select(Investment)).balance == Decimal("2100.50")


def test_new_deposits_land_in_the_suggested_pot_by_rate(db, connection, monkeypatch):
    # No PicPay cada depósito vira um CDB separado, todos com o mesmo nome
    deposito_2 = {
        **CAIXINHA,
        "id": "inv-2",
        "balance": 500,
        "purchaseDate": "2026-10-05T03:00:00.000Z",
    }
    outra_taxa = {**CAIXINHA, "id": "inv-3", "balance": 80, "rate": 102}
    use_fake(
        monkeypatch, FakePluggy([CHECKING], {}, investments=[CAIXINHA, deposito_2, outra_taxa])
    )

    sync_all(db)

    pots = {p.name: p for p in db.scalars(select(SavingsPot))}
    assert set(pots) == {"PicPay CDB 110% do CDI", "PicPay CDB 102% do CDI"}
    assert sorted(i.external_id for i in pots["PicPay CDB 110% do CDI"].investments) == [
        "inv-1",
        "inv-2",
    ]
    inv = db.scalar(select(Investment).where(Investment.external_id == "inv-1"))
    assert (inv.rate, inv.rate_type, inv.amount_original) == (
        Decimal("110"),
        "CDI",
        Decimal("2000.00"),
    )
    assert (inv.purchase_date, inv.due_date) == (date(2026, 9, 10), date(2029, 9, 9))

    # Renomeado pelo usuário, o cofrinho continua recebendo os depósitos com a mesma taxa
    pots["PicPay CDB 110% do CDI"].name = "Reserva"
    db.commit()
    novo = {**CAIXINHA, "id": "inv-4", "balance": 50}
    use_fake(
        monkeypatch,
        FakePluggy([CHECKING], {}, investments=[CAIXINHA, deposito_2, outra_taxa, novo]),
    )
    sync_all(db)
    reserva = db.scalar(select(SavingsPot).where(SavingsPot.name == "Reserva"))
    assert len(reserva.investments) == 3


def test_pots_api_create_rename_goal_move_and_delete(client, db, connection, auth_headers):
    db.add(
        Investment(
            connection_id=connection.id,
            external_id="i1",
            name="CDB",
            type="FIXED_INCOME",
            balance=Decimal("300"),
        )
    )
    db.commit()
    inv_id = client.get("/investments", headers=auth_headers).json()[0]["id"]

    pot = client.post("/pots", json={"name": "Viagem", "goal_amount": "3000"}, headers=auth_headers)
    assert pot.status_code == 201
    pot_id = pot.json()["id"]
    moved = client.patch(f"/investments/{inv_id}", json={"pot_id": pot_id}, headers=auth_headers)
    assert moved.json()["pot_id"] == pot_id

    pots = client.get("/pots", headers=auth_headers).json()
    assert [(p["name"], Decimal(p["balance"]), p["investments"]) for p in pots] == [
        ("Viagem", Decimal("300"), 1)
    ]
    renamed = client.patch(f"/pots/{pot_id}", json={"name": "Japão"}, headers=auth_headers).json()
    assert renamed["name"] == "Japão" and Decimal(renamed["goal_amount"]) == Decimal("3000")
    no_goal = client.patch(
        f"/pots/{pot_id}", json={"goal_amount": None}, headers=auth_headers
    ).json()
    assert no_goal["goal_amount"] is None and no_goal["name"] == "Japão"

    # Apagar o cofrinho não apaga a aplicação: ela fica sem cofrinho
    assert client.delete(f"/pots/{pot_id}", headers=auth_headers).status_code == 204
    assert client.get("/investments", headers=auth_headers).json()[0]["pot_id"] is None
    assert client.patch("/pots/999", json={}, headers=auth_headers).status_code == 404
    assert (
        client.patch(
            f"/investments/{inv_id}", json={"pot_id": 999}, headers=auth_headers
        ).status_code
        == 404
    )
