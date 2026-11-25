"""Saldo dos cofrinhos: o do banco e o informado pelo usuário, sem um apagar o outro."""

from datetime import date, timedelta
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
    TransactionSource,
)
from app.services import insights, pots
from app.services.categories import ensure_categories

TODAY = date(2026, 11, 25)  # quarta


@pytest.fixture
def setup(db):
    conn = Connection(external_id="item", institution_name="MeuPluggy", status="UPDATED")
    db.add(conn)
    db.flush()
    pot = SavingsPot(name="Reserva")
    # Sem data de compra: rendimento médio zero, para as contas ficarem exatas
    inv = Investment(
        connection_id=conn.id,
        external_id="i1",
        name="CDB",
        type="FIXED_INCOME",
        balance=Decimal("19468.29"),
        balance_date=date(2026, 11, 1),
        pot=pot,
    )
    db.add_all([pot, inv])
    db.commit()
    return conn, pot, inv


def test_stale_bank_balance_is_flagged(db, setup):
    _, pot, _ = setup
    st = pots.state(pot, TODAY)
    assert st.stale and st.source == "bank" and st.balance == Decimal("19468.29")
    assert st.bank_as_of == date(2026, 11, 1)

    fresh = pots.state(pot, date(2026, 11, 3))
    assert not fresh.stale


def test_checkin_wins_while_newer_then_bank_takes_over_and_is_compared(db, setup):
    _, pot, inv = setup
    pots.add_checkin(db, pot, Decimal("21300"), TODAY - timedelta(days=1))
    db.commit()

    st = pots.state(pot, TODAY)
    assert (st.source, st.balance, st.bank_balance) == ("manual", Decimal("21300"), inv.balance)
    assert st.divergence is None

    # O banco volta a atualizar e bate (dentro da tolerância): vale o do banco, sem aviso
    inv.balance, inv.balance_date = Decimal("21305"), TODAY
    db.commit()
    st = pots.state(pot, TODAY)
    assert (st.source, st.balance, st.divergence) == ("bank", Decimal("21305"), None)
    assert st.expected == Decimal("21300")

    # Não bate: aviso de divergência, mas o saldo mostrado é o do banco (mais recente)
    inv.balance = Decimal("20000")
    db.commit()
    st = pots.state(pot, TODAY)
    assert (st.source, st.balance, st.divergence) == ("bank", Decimal("20000"), Decimal("-1300"))
    found = [i for i in insights.find(db, TODAY) if i["kind"] == "pot_divergence"]
    assert len(found) == 1 and "R$ 1.300,00 a menos" in found[0]["detail"]

    # Usuário aceita o valor do banco: some o aviso, e o informado não volta a valer
    pots.accept_bank(pot)
    db.commit()
    st = pots.state(pot, TODAY)
    assert (st.checkin, st.divergence, st.source) == (None, None, "bank")


def test_checkin_grows_with_the_pot_average_yield(db, setup):
    _, pot, inv = setup
    inv.purchase_date, inv.amount_original = date(2026, 9, 10), Decimal("19174.23")
    db.commit()
    # Média por dia útil (em centavos): dias úteis de 10/09 a 25/11
    average = ((inv.balance - inv.amount_original) / 54).quantize(Decimal("0.01"))
    pots.add_checkin(db, pot, Decimal("21000"), date(2026, 11, 20))  # sexta
    db.commit()
    st = pots.state(pot, TODAY)
    assert st.source == "manual"
    # 3 dias úteis depois (seg, ter, qua)
    assert st.balance == Decimal("21000") + average * 3


def test_unreflected_flows_and_api(client, db, setup, auth_headers):
    conn, pot, _ = setup
    ensure_categories(db)
    cat = db.scalar(select(Category.id).where(Category.key == "investments"))
    checking = Account(connection_id=conn.id, name="PICPAY INSTITUIÇÃO", type=AccountType.CHECKING)
    db.add(checking)
    db.flush()
    for i, (d, amount) in enumerate(
        [(date(2026, 10, 30), "-999"), (date(2026, 11, 4), "-1000"), (date(2026, 11, 22), "300")]
    ):
        db.add(
            Transaction(
                account_id=checking.id,
                external_id=f"f{i}",
                source=TransactionSource.PLUGGY,
                date=d,
                amount=Decimal(amount),
                description="Aporte na carteira Cofrinho",
                category_id=cat,
            )
        )
    db.commit()

    [flow] = pots.unreflected_flows(db, TODAY)
    assert (flow["bank"], flow["since"], flow["count"]) == ("PicPay", date(2026, 11, 1), 2)
    assert (flow["deposits"], flow["withdrawals"], flow["net"]) == (1000, 300, 700)

    r = client.post(f"/pots/{pot.id}/checkins", json={"amount": "20168.29"}, headers=auth_headers)
    assert r.status_code == 201
    body = r.json()
    assert body["source"] == "manual" and Decimal(body["current_balance"]) == Decimal("20168.29")
    assert Decimal(body["balance"]) == Decimal("19468.29")  # o do banco continua lá
    assert Decimal(body["checkin"]["amount"]) == Decimal("20168.29")

    future = (date.today() + timedelta(days=1)).isoformat()
    bad = client.post(
        f"/pots/{pot.id}/checkins", json={"amount": "1", "day": future}, headers=auth_headers
    )
    assert bad.status_code == 422

    accepted = client.post(f"/pots/{pot.id}/accept-bank", headers=auth_headers).json()
    assert accepted["checkin"] is None
    flows = client.get("/pots/unreflected", headers=auth_headers).json()
    assert len(flows) == 1
