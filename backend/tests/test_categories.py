from datetime import date
from decimal import Decimal

from sqlalchemy import select

from app.db.models import Account, AccountType, Category, Transaction, TransactionSource
from app.services import analytics
from app.services.categories import recategorize_all


def test_pairs_and_builtin_rules_separate_bills_and_cofrinhos_from_cash(db):
    checking = Account(name="Conta", type=AccountType.CHECKING)
    card = Account(name="Cartão", type=AccountType.CREDIT_CARD)
    db.add_all([checking, card])
    db.flush()

    def add(account, day, amount, desc, provider, user_category=None):
        t = Transaction(
            account_id=account.id,
            external_id=f"{account.name}-{day}-{amount}",
            source=TransactionSource.PLUGGY,
            date=date(2026, 9, day),
            amount=Decimal(amount),
            description=desc,
            provider_category_id=provider,
        )
        if user_category:
            t.user_categorized = True
            t.category_id = user_category
        db.add(t)
        return t

    add(checking, 5, "5000", "CRÉD FOLHA DE PAG. SALÁRIO", "01010000")
    # Fatura paga pela conta: a Pluggy manda como "Transfers" e com descrição genérica
    bill = add(checking, 12, "-500", "PICPAY INSTITUICAO DE PAGAMENTO S/A", "05000000")
    add(card, 13, "500", "PAGAMENTO DE FATURA", "05100000")
    pix = add(checking, 12, "-80", "PIX ENVIADO FULANO", "05000000")
    # Cofrinho compartilhado: Pix de outra pessoa que vai direto para o cofrinho
    add(checking, 1, "-1000", "Aporte automático no Cofrinho Compartilhado", "03000000")
    shared = add(checking, 1, "1000", "PIX recebido", "05070000")
    gift = add(checking, 8, "1500", "PIX recebido", "05070000")
    rescue = add(checking, 13, "460.22", "Resgate na carteira Cofrinho", "03060000")
    add(checking, 9, "-460", "Aporte na carteira Cofrinho", "03000000")
    db.commit()

    recategorize_all(db)
    key = {c.id: c.key for c in db.scalars(select(Category))}

    assert key[bill.category_id] == "card_payment" and bill.is_transfer
    assert key[pix.category_id] == "transfers_out"
    assert key[shared.category_id] == "investments"
    assert key[gift.category_id] == "transfers_in"
    assert key[rescue.category_id] == "investments"

    # Sem faturas conhecidas, o ciclo é o mês e a fatura conta pelo valor pago
    flow = analytics.summary(db, "2026-09", date(2026, 10, 17))["flow"]
    assert flow["income"] == Decimal("6500")
    assert flow["spent"] == Decimal("80")
    assert flow["card_bills"] == Decimal("500")
    # Aportes 1460 menos resgate 460,22 menos a parte da outra pessoa (1000)
    assert flow["saved"] == Decimal("-0.22")
    # "Sobrou" é exatamente quanto o saldo da conta mudou
    total = sum(
        t.amount
        for t in db.scalars(select(Transaction).where(Transaction.account_id == checking.id))
    )
    assert flow["result"] == total == Decimal("5920.22")
    assert flow["check"]["difference"] == 0


def test_manual_choice_is_never_relinked(db):
    recategorize_all(db)  # cria as categorias
    other = db.scalar(select(Category).where(Category.key == "shopping"))
    checking = Account(name="Conta", type=AccountType.CHECKING)
    card = Account(name="Cartão", type=AccountType.CREDIT_CARD)
    db.add_all([checking, card])
    db.flush()
    mine = Transaction(
        account_id=checking.id,
        external_id="a",
        source=TransactionSource.PLUGGY,
        date=date(2026, 9, 12),
        amount=Decimal("-300"),
        description="LOJA",
        provider_category_id="05000000",
        category_id=other.id,
        user_categorized=True,
    )
    db.add_all(
        [
            mine,
            Transaction(
                account_id=card.id,
                external_id="b",
                source=TransactionSource.PLUGGY,
                date=date(2026, 9, 12),
                amount=Decimal("300"),
                description="PAGAMENTO DE FATURA",
                provider_category_id="05100000",
            ),
        ]
    )
    db.commit()

    recategorize_all(db)

    assert mine.category_id == other.id
