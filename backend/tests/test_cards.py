from datetime import date
from decimal import Decimal

from sqlalchemy import select

from app.db.models import (
    Account,
    AccountType,
    CardBill,
    Category,
    Connection,
    Transaction,
    TransactionSource,
    TransactionStatus,
)
from app.services import analytics
from app.services.cards import cards
from app.services.categories import ensure_categories

TODAY = date(2026, 10, 17)


def test_bills_status_open_bill_and_limit(db):
    ensure_categories(db)
    cat = {c.key: c.id for c in db.scalars(select(Category))}
    conn = Connection(external_id="item", institution_name="MeuPluggy", status="UPDATED")
    db.add(conn)
    db.flush()
    checking = Account(connection_id=conn.id, name="PICPAY INSTITUIÇÃO", type=AccountType.CHECKING)
    card = Account(
        connection_id=conn.id,
        name="PIC PAY MASTERCARD PLATINUM",
        type=AccountType.CREDIT_CARD,
        balance=Decimal("-2500"),
        credit_limit=Decimal("10000"),
        available_credit_limit=Decimal("7500"),
        installments_limit_used=Decimal("1800"),
        card_brand="MASTERCARD",
        card_level="PLATINUM",
        card_number="4321",
    )
    db.add_all([checking, card])
    db.flush()
    db.add_all(
        [
            CardBill(
                account_id=card.id,
                external_id="b-set",
                due_date=date(2026, 9, 15),
                total_amount=Decimal("1747.78"),
            ),
            CardBill(
                account_id=card.id,
                external_id="b-out",
                due_date=date(2026, 10, 15),
                total_amount=Decimal("1162.08"),
                minimum_payment=Decimal("58.10"),
            ),
        ]
    )
    n = 0

    def add(d, amount, key, bill=None, post=None, status=TransactionStatus.POSTED):
        nonlocal n
        n += 1
        meta = {k: v for k, v in (("billId", bill), ("billPostDate", post)) if v}
        db.add(
            Transaction(
                account_id=card.id,
                external_id=f"t{n}",
                source=TransactionSource.PLUGGY,
                date=d,
                amount=Decimal(amount),
                description="x",
                category_id=cat[key],
                status=status,
                raw={"creditCardMetadata": meta},
            )
        )

    add(date(2026, 9, 12), "1747.78", "card_payment")  # paga a de setembro
    add(date(2026, 9, 20), "-600", "groceries", "b-out", "2026-09-21")
    add(date(2026, 10, 7), "-562.08", "shopping", "b-out", "2026-10-08")
    # Compras da fatura aberta (sem billId) e uma parcela que só entra numa fatura futura
    add(date(2026, 10, 9), "-506.66", "shopping", status=TransactionStatus.PENDING)
    add(date(2026, 10, 14), "-34.77", "ride_hailing", status=TransactionStatus.PENDING)
    add(date(2026, 11, 9), "-506.66", "shopping", status=TransactionStatus.PENDING)
    db.commit()

    [c] = cards(db, TODAY)

    assert (c["bank"], c["brand"], c["number"]) == ("PicPay", "MASTERCARD", "4321")
    assert (c["used"], c["installments_used"]) == (Decimal("2500"), Decimal("1800"))
    open_bill, october, september = c["bills"]
    assert open_bill["status"] == "open" and open_bill["amount"] == Decimal("541.43")
    # Fecha em 08/11: é a fatura do ciclo de outubro (09/10 a 08/11)
    assert (open_bill["competence"], open_bill["due_date"]) == ("2026-10", date(2026, 11, 15))
    assert october["competence"] == "2026-09"
    # Outubro fechou 7 dias antes do vencimento; novembro deve fechar igual
    assert october["close_date"] == date(2026, 10, 8)
    assert open_bill["close_date"] == date(2026, 11, 8)
    # Venceu dia 15 sem pagamento no cartão
    assert october["status"] == "overdue" and october["purchases"] == 2
    assert september["status"] == "paid" and september["paid_at"] == date(2026, 9, 12)

    # O resumo cobra as faturas de verdade, não o limite usado (que inclui parcelas futuras)
    s = analytics.summary(db, "2026-10", TODAY)
    assert s["card_debt"] == Decimal("1162.08") + Decimal("541.43")
    assert (s["next_bill_due"], s["next_bill_amount"]) == (date(2026, 10, 15), Decimal("1162.08"))


def test_bill_charges_follow_purchases_not_bank_total(db):
    """Nubank: fatura paga antes de fechar vem com total 0; fatura não paga é cobrada na
    seguinte (o total da seguinte inclui a anterior). O custo de cada fatura são as compras."""
    ensure_categories(db)
    cat = {c.key: c.id for c in db.scalars(select(Category))}
    card = Account(name="gold", type=AccountType.CREDIT_CARD)
    db.add(card)
    db.flush()
    bills = [
        ("b0", date(2026, 5, 17), "100"),  # paga antes da janela do sync: sem compras aqui
        ("b1", date(2026, 6, 17), "5.90"),  # não foi paga: cobrada na b2
        ("b2", date(2026, 7, 17), "11.80"),  # 5,90 de compras + 5,90 da b1
        ("b3", date(2026, 8, 17), "0"),  # 5,90 de compras, paga antes de fechar
    ]
    for ext, due, total in bills:
        db.add(
            CardBill(account_id=card.id, external_id=ext, due_date=due, total_amount=Decimal(total))
        )
    n = 0

    def add(d, amount, key, bill=None):
        nonlocal n
        n += 1
        db.add(
            Transaction(
                account_id=card.id,
                external_id=f"g{n}",
                source=TransactionSource.PLUGGY,
                date=d,
                amount=Decimal(amount),
                description="x",
                category_id=cat[key],
                raw={"creditCardMetadata": {"billId": bill}} if bill else None,
            )
        )

    add(date(2026, 5, 25), "-5.90", "subscriptions", "b1")
    add(date(2026, 6, 25), "-5.90", "subscriptions", "b2")
    add(date(2026, 7, 10), "11.80", "card_payment")
    add(date(2026, 7, 25), "-5.90", "subscriptions", "b3")
    add(date(2026, 8, 7), "5.90", "card_payment")
    db.commit()

    [c] = cards(db, TODAY)
    by_due = {b["due_date"]: b for b in c["bills"]}

    b1, b2, b3 = (by_due[date(2026, m, 17)] for m in (6, 7, 8))
    assert (b1["charges"], b1["paid_at"]) == (Decimal("5.90"), date(2026, 7, 10))
    assert (b2["charges"], b2["paid_at"]) == (Decimal("5.90"), date(2026, 7, 10))
    assert (b3["charges"], b3["paid_at"]) == (Decimal("5.90"), date(2026, 8, 7))
    # A primeira do histórico não é "carregada" para as seguintes
    assert by_due[date(2026, 5, 17)]["charges"] == Decimal("100")


def test_open_bill_counts_installments_the_bank_has_not_sent_yet(db):
    """PicPay só manda a parcela do mês quando a fatura fecha; a aberta tem que contar com ela.
    Sicoob manda as parcelas com a data da compra e a Pluggy apaga a última quando a fatura
    fecha: a fatura fechada depois dela cobrou a parcela, então o parcelamento acabou."""
    ensure_categories(db)
    cat = {c.key: c.id for c in db.scalars(select(Category))}
    picpay = Account(
        name="PIC PAY",
        type=AccountType.CREDIT_CARD,
        credit_limit=Decimal("10000"),
        available_credit_limit=Decimal("7836"),
    )
    sicoob = Account(
        name="SICOOB",
        type=AccountType.CREDIT_CARD,
        credit_limit=Decimal("2800"),
        available_credit_limit=Decimal("2800"),  # nada devido: a última foi paga
    )
    db.add_all([picpay, sicoob])
    db.flush()
    for card, ext, due, total in [
        (picpay, "p-set", date(2026, 9, 15), "506.70"),
        (picpay, "p-out", date(2026, 10, 15), "599.07"),
        (picpay, "p-nov", date(2026, 11, 15), "599.04"),
        (sicoob, "s-set", date(2026, 9, 11), "100"),
        (sicoob, "s-out", date(2026, 10, 11), "100"),
        (sicoob, "s-nov", date(2026, 11, 11), "100"),
    ]:
        db.add(
            CardBill(account_id=card.id, external_id=ext, due_date=due, total_amount=Decimal(total))
        )
    n = 0

    def add(card, d, amount, desc, number=None, total=None, bill=None, merchant=None):
        nonlocal n
        n += 1
        db.add(
            Transaction(
                account_id=card.id,
                external_id=f"i{n}",
                source=TransactionSource.PLUGGY,
                date=d,
                amount=Decimal(amount),
                description=desc,
                merchant=merchant,
                category_id=cat["shopping"],
                status=TransactionStatus.POSTED if bill else TransactionStatus.PENDING,
                installment_number=number,
                installment_total=total,
                raw={"creditCardMetadata": {"billId": bill} if bill else {}},
            )
        )

    add(picpay, date(2026, 8, 8), "-506.70", "T CAMPESTRINI PARC01/06", 1, 6, "p-set")
    add(picpay, date(2026, 9, 10), "-506.66", "T CAMPESTRINI PARC02/06", 2, 6, "p-out")
    add(picpay, date(2026, 10, 9), "-506.66", "T CAMPESTRINI PARC03/06", 3, 6, "p-nov")
    # A Pluggy só enriquece o estabelecimento na 1ª: continua sendo a mesma compra
    add(picpay, date(2026, 9, 21), "-92.41", "APP *VOXOWAPARC01/04", 1, 4, "p-out", "Voxowa")
    add(picpay, date(2026, 10, 21), "-92.38", "APP *VOXOWAPARC02/04", 2, 4, "p-nov")
    add(picpay, date(2026, 11, 17), "-179.46", "BRS*SHEINCOM")  # compra à vista na aberta
    add(sicoob, date(2026, 8, 8), "-100", "T CAMPESTRINI JOIAS", 1, 3, "s-set")
    add(sicoob, date(2026, 8, 8), "-100", "T CAMPESTRINI JOIAS", 2, 3, "s-out")
    db.commit()

    by_name = {c["name"]: c for c in cards(db, date(2026, 11, 25))}
    open_bill = by_name["PIC PAY"]["bills"][0]
    assert open_bill["status"] == "open"
    # 179,46 à vista + Campestrini 4/6 + Voxowa 3/4
    assert open_bill["amount"] == Decimal("179.46") + Decimal("506.66") + Decimal("92.38")
    latest_sicoob = by_name["SICOOB"]["bills"][0]
    assert (latest_sicoob["id"], latest_sicoob["status"]) == ("s-nov", "paid")

    found = {(i["name"], i["account_name"]): i for i in analytics.installments(db)}
    assert set(found) == {("T CAMPESTRINI", "PIC PAY"), ("APP *VOXOWA", "PIC PAY")}
    assert found[("T CAMPESTRINI", "PIC PAY")]["paid"] == 3
    assert found[("APP *VOXOWA", "PIC PAY")]["paid"] == 2


def test_open_bill_does_not_double_count_an_installment_already_sent(db):
    ensure_categories(db)
    shopping = db.scalar(select(Category.id).where(Category.key == "shopping"))
    card = Account(name="PIC PAY", type=AccountType.CREDIT_CARD)
    db.add(card)
    db.flush()
    db.add(
        CardBill(account_id=card.id, external_id="b1", due_date=date(2026, 11, 15), total_amount=50)
    )
    for i, (d, number, bill) in enumerate(
        [(date(2026, 10, 9), 1, "b1"), (date(2026, 11, 9), 2, None)]
    ):
        db.add(
            Transaction(
                account_id=card.id,
                external_id=f"d{i}",
                source=TransactionSource.PLUGGY,
                date=d,
                amount=Decimal("-50"),
                description=f"LOJA PARC0{number}/03",
                category_id=shopping,
                status=TransactionStatus.POSTED,
                installment_number=number,
                installment_total=3,
                raw={"creditCardMetadata": {"billId": bill} if bill else {}},
            )
        )
    db.commit()

    [c] = cards(db, date(2026, 11, 25))
    assert c["bills"][0]["amount"] == Decimal("50")
