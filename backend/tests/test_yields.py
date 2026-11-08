from datetime import date
from decimal import Decimal

from app.db.models import Connection, Investment, InvestmentSnapshot, SavingsPot
from app.services import yields


def test_business_days_skip_weekends():
    # Sexta 16/10 → segunda 19/10: só a segunda é dia útil
    assert yields.business_days(date(2026, 10, 16), date(2026, 10, 19)) == 1
    assert yields.business_days(date(2026, 10, 1), date(2026, 10, 31)) == 21
    assert yields.business_days(date(2026, 10, 5), date(2026, 10, 5)) == 0


def test_pot_yields_average_and_day_by_day(client, db, auth_headers):
    conn = Connection(external_id="item", institution_name="PicPay", status="UPDATED")
    pot = SavingsPot(name="Viagem")
    db.add_all([conn, pot])
    db.flush()
    old = Investment(
        connection_id=conn.id,
        external_id="cdb-1",
        name="CDB",
        type="FIXED_INCOME",
        balance=Decimal("1010"),
        amount_original=Decimal("1000"),
        purchase_date=date(2026, 9, 21),  # 24 dias úteis até 23/10
        pot_id=pot.id,
    )
    db.add(old)
    db.flush()
    db.add_all(
        [
            InvestmentSnapshot(
                investment_id=old.id,
                day=date(2026, 10, 21),
                balance=Decimal("1009.20"),
                amount_original=Decimal("1000"),
            ),
            InvestmentSnapshot(
                investment_id=old.id,
                day=date(2026, 10, 22),
                balance=Decimal("1009.60"),
                amount_original=Decimal("1000"),
            ),
        ]
    )
    db.commit()
    # Depósito novo no dia 23: entra como aplicação nova, não como rendimento
    new = Investment(
        connection_id=conn.id,
        external_id="cdb-2",
        name="CDB",
        type="FIXED_INCOME",
        balance=Decimal("500.05"),
        amount_original=Decimal("500"),
        purchase_date=date(2026, 10, 22),
        pot_id=pot.id,
    )
    db.add(new)
    db.flush()
    yields.record_snapshots(db, date(2026, 10, 23))
    db.commit()

    data = yields.pot_yields(pot, date(2026, 10, 23))

    assert data["tracking_since"] == date(2026, 10, 21)
    # 10 em 24 dias úteis (0,4167) + 0,05 em 1 dia útil
    assert data["average_per_business_day"] == Decimal("0.47")
    assert [(d["day"], d["earned"]) for d in data["daily"]] == [
        (date(2026, 10, 23), Decimal("0.45")),  # 0,40 do antigo + 0,05 do novo
        (date(2026, 10, 22), Decimal("0.40")),
    ]
    resp = client.get(f"/pots/{pot.id}/yields", headers=auth_headers)
    assert resp.status_code == 200 and len(resp.json()["daily"]) == 2


def test_frozen_balance_gets_estimated(db):
    """PicPay repetindo o mesmo saldo: a partir do último dia que mudou, estima pela média."""
    conn = Connection(external_id="item-f", institution_name="PicPay", status="UPDATED")
    pot = SavingsPot(name="Reserva")
    db.add_all([conn, pot])
    db.flush()
    inv = Investment(
        connection_id=conn.id,
        external_id="cdb-f",
        name="CDB",
        type="FIXED_INCOME",
        balance=Decimal("1020"),
        amount_original=Decimal("1000"),
        purchase_date=date(2026, 9, 28),
        pot_id=pot.id,
    )
    db.add(inv)
    db.flush()
    for day, balance in [(23, "1019"), (24, "1020"), (27, "1020"), (28, "1020"), (29, "1020")]:
        db.add(
            InvestmentSnapshot(
                investment_id=inv.id, day=date(2026, 10, day), balance=Decimal(balance)
            )
        )
    db.commit()

    # Sem mudar desde sábado 24/10: na quinta 29/10 são 4 dias úteis. A média é 1020 − 1000 = 20
    # em 23 dias úteis desde a compra (R$ 0,87 por dia útil): 1020 + 4 × 0,87
    since, estimate = yields.frozen_estimate(pot, date(2026, 10, 29))
    assert since == date(2026, 10, 24)
    assert estimate == Decimal("1023.48")
    # Ainda dentro da tolerância (1 dia útil sem mudar): sem estimativa
    assert yields.frozen_estimate(pot, date(2026, 10, 26)) == (None, None)
