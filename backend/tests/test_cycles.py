from datetime import date
from decimal import Decimal

from sqlalchemy import select

from app.db.models import (
    Account,
    AccountType,
    CardBill,
    Category,
    Transaction,
    TransactionSource,
)
from app.services import analytics, cycles
from app.services.categories import ensure_categories

TODAY = date(2026, 10, 17)


def _setup(db):
    """PicPay (vence dia 15, fecha 7 dias antes) e Nubank (vence dia 19, sem medidas)."""
    ensure_categories(db)
    cat = {c.key: c.id for c in db.scalars(select(Category))}
    checking = Account(name="Conta", type=AccountType.CHECKING, balance=Decimal("1000"))
    picpay = Account(name="PicPay", type=AccountType.CREDIT_CARD)
    nubank = Account(name="Nubank", type=AccountType.CREDIT_CARD)
    db.add_all([checking, picpay, nubank])
    db.flush()
    n = 0

    def add(account, d, amount, key, bill=None, post=None):
        nonlocal n
        n += 1
        meta = {k: v for k, v in (("billId", bill), ("billPostDate", post)) if v}
        db.add(
            Transaction(
                account_id=account.id,
                external_id=f"t{n}",
                source=TransactionSource.PLUGGY,
                date=d,
                amount=Decimal(amount),
                description=key,
                category_id=cat[key],
                raw={"creditCardMetadata": meta} if meta else None,
            )
        )

    # Três faturas do PicPay com o último lançamento 7 dias antes do vencimento
    for month, total in ((8, "300"), (9, "400"), (10, "500")):
        due = date(2026, month, 15)
        db.add(
            CardBill(
                account_id=picpay.id,
                external_id=f"pp-{month}",
                due_date=due,
                total_amount=Decimal(total),
            )
        )
        add(
            picpay,
            date(2026, month, 7),
            f"-{total}",
            "groceries",
            f"pp-{month}",
            f"2026-{month:02d}-08",
        )
    db.add(
        CardBill(
            account_id=nubank.id,
            external_id="nu-10",
            due_date=date(2026, 10, 19),
            total_amount=Decimal("19.90"),
        )
    )
    # Compra de 26/09 na fatura do Nubank que fecha em 12/10: ciclo de outubro
    add(nubank, date(2026, 9, 26), "-19.90", "subscriptions", "nu-10", "2026-09-27")
    # Conta: salário no fim do mês e o Pix do começo do mês seguinte, no mesmo ciclo
    add(checking, date(2026, 9, 29), "4000", "salary")
    add(checking, date(2026, 10, 6), "1500", "transfers_in")
    add(checking, date(2026, 10, 9), "-50", "eating_out")  # já é o ciclo seguinte
    add(checking, date(2026, 9, 12), "-400", "card_payment")  # paga a fatura de 15/09
    add(checking, date(2026, 10, 10), "-500", "card_payment")  # paga a fatura de 15/10
    add(picpay, date(2026, 9, 12), "400", "card_payment")
    add(picpay, date(2026, 10, 10), "500", "card_payment")
    db.commit()
    return checking, picpay, nubank


def test_cycle_follows_reference_card_closing(db):
    _setup(db)
    cyc = cycles.load(db)

    assert cyc.reference.name == "PicPay"
    assert cyc.bounds("2026-09") == (date(2026, 9, 9), date(2026, 10, 9))
    assert cyc.key_of(date(2026, 10, 8)) == "2026-09"
    assert cyc.key_of(date(2026, 10, 9)) == "2026-10"
    # Nubank sem medidas: fecha 7 dias antes do vencimento (12/10), já no ciclo seguinte
    assert cyc.cards[3].close_for_due(date(2026, 10, 19)) == date(2026, 10, 12)


def test_cycle_flow_counts_bill_by_closing_and_reconciles(db):
    _setup(db)
    s = analytics.summary(db, "2026-09", TODAY)
    flow = s["flow"]

    assert s["cycle"]["start"] == date(2026, 9, 9) and s["cycle"]["end"] == date(2026, 10, 8)
    assert flow["income"] == Decimal("5500")  # salário de 29/09 + Pix de 06/10
    # Fatura do ciclo = a do PicPay que fecha em 08/10; a do Nubank fecha em 12/10
    assert flow["card_bills"] == Decimal("500")
    assert [b["bank"] for b in flow["bills"]] == ["PicPay"]
    assert flow["result"] == Decimal("5000")
    # Começou com: saldo em 09/09 menos a fatura fechada em 08/09 ainda não paga (400)
    assert flow["check"]["difference"] == 0
    assert flow["ended_with"] == flow["started_with"] + flow["result"]

    # Despesas do ciclo: a compra do PicPay da fatura que fecha em 08/10
    assert s["expense"] == Decimal("500")
    october = analytics.summary(db, "2026-10", TODAY)
    assert october["expense"] == Decimal("50") + Decimal("19.90")


def test_closing_day_chosen_by_user_moves_the_cycle(db):
    _, picpay, _ = _setup(db)
    picpay.closing_day = 10
    db.commit()

    cyc = cycles.load(db)

    assert cyc.bounds("2026-09") == (date(2026, 9, 11), date(2026, 10, 11))
    ids = analytics.transaction_ids_in_cycle(db, "2026-09")
    descriptions = {db.get(Transaction, i).description for i in ids}
    assert "eating_out" in descriptions  # 09/10 agora ainda é o ciclo de setembro


def test_bill_paid_before_closing_keeps_cycles_chained(db):
    checking, _, nubank = _setup(db)
    cat = {c.key: c.id for c in db.scalars(select(Category))}
    # Fatura do Nubank (fecha 12/10) paga em 10/10, ainda no ciclo de setembro
    for account, amount in ((checking, "-19.90"), (nubank, "19.90")):
        db.add(
            Transaction(
                account_id=account.id,
                external_id=f"early-{account.id}",
                source=TransactionSource.PLUGGY,
                date=date(2026, 10, 8),
                amount=Decimal(amount),
                description="pagamento antecipado",
                category_id=cat["card_payment"],
            )
        )
    db.commit()

    september = analytics.summary(db, "2026-09", TODAY)["flow"]
    october = analytics.summary(db, "2026-10", TODAY)["flow"]

    assert september["check"]["difference"] == 0
    assert october["started_with"] == september["ended_with"]


def test_start_day_chosen_by_user_overrides_card_closing(client, db, auth_headers):
    _setup(db)
    resp = client.put("/dashboard/cycle", json={"start_day": 11}, headers=auth_headers)
    assert resp.status_code == 200 and resp.json()["start_day"] == 11

    cyc = cycles.load(db)
    assert cyc.bounds("2026-09") == (date(2026, 9, 11), date(2026, 10, 11))
    assert cyc.key_of(date(2026, 10, 10)) == "2026-09"
    assert cyc.key_of(date(2026, 10, 11)) == "2026-10"
    # A fatura do PicPay (fecha 08/10) continua no ciclo em que fecha
    flow = analytics.summary(db, "2026-09", TODAY)["flow"]
    assert flow["card_bills"] == Decimal("500") and flow["check"]["difference"] == 0

    client.put("/dashboard/cycle", json={"start_day": None}, headers=auth_headers)
    assert cycles.load(db).bounds("2026-09") == (date(2026, 9, 9), date(2026, 10, 9))
    invalid = client.put("/dashboard/cycle", json={"start_day": 31}, headers=auth_headers)
    assert invalid.status_code == 422
