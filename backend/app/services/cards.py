"""Cartões de crédito e as faturas de cada um.

- Faturas fechadas vêm da Pluggy (GET /bills): vencimento, total e pagamento mínimo. O
  fechamento é estimado pelo calendário do cartão (app/services/cycles.py).
- A fatura aberta é calculada: compras do cartão que ainda não têm `billId`
  (creditCardMetadata) e entram na próxima fatura a fechar.
- Paga: os pagamentos recebidos no cartão (categoria "Pagamento de fatura") perto do
  vencimento cobrem o total. Cada pagamento quita no máximo uma fatura. Só a última fatura
  fechada pode estar em aberto: uma não paga é cobrada na seguinte.
- O que a fatura custou no ciclo (`charges`) são as compras dela, não o total que o banco
  informa: o total vem zerado quando a fatura foi paga antes de fechar e inclui a fatura
  anterior quando ela não foi paga. Exceção: faltando compras com a anterior paga, é histórico
  incompleto (começo da janela do sync), e vale o total.
- Competência da fatura = o ciclo em que ela fecha: a que fecha em 08/10 é a "fatura de
  setembro" (ciclo de 09/09 a 08/10).
"""

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db.models import Account, AccountType, Category, Transaction
from app.services import cycles as cycle_service
from app.services.cycles import ONE_DAY, Cycles

ZERO = Decimal("0")
# Centavos de diferença entre total e pagamento (o Nubank manda 19.9044 e cobra 19,90)
PAID_TOLERANCE = Decimal("0.05")
# Pagamento conta para a fatura se cair de 25 dias antes até 10 dias depois do vencimento
PAYMENT_BEFORE = timedelta(days=25)
PAYMENT_AFTER = timedelta(days=10)

# Nomes curtos para emissores conhecidos; os demais usam a primeira palavra do nome
ISSUER_NAMES = {"PICPAY": "PicPay", "NU": "Nubank", "MERCADO": "Mercado Pago", "INTER": "Inter"}
LIQUID_TYPES = (AccountType.CHECKING, AccountType.SAVINGS)


@dataclass
class _Purchase:
    date: date
    amount: Decimal
    bill_id: str | None
    is_payment: bool


def short_bank_name(name: str) -> str:
    first = name.split(" ")[0] if name else ""
    return ISSUER_NAMES.get(first.upper(), first.title() or "Banco")


def bank_name(account: Account, accounts: list[Account]) -> str:
    """Banco do cartão. Pelo MeuPluggy o conector se chama sempre "MeuPluggy", e o nome do
    cartão nem sempre diz o banco ("gold"); a conta corrente da mesma conexão diz."""
    institution = account.connection.institution_name if account.connection else ""
    if institution and institution != "MeuPluggy":
        return institution
    sibling = next(
        (
            a
            for a in accounts
            if a.connection_id == account.connection_id
            and a.connection_id is not None
            and a.type in LIQUID_TYPES
        ),
        account,
    )
    return short_bank_name(sibling.name)


def _purchases(db: Session, account: Account, card_payment_id: int | None) -> list[_Purchase]:
    rows = db.scalars(select(Transaction).where(Transaction.account_id == account.id))
    result = []
    for t in rows:
        result.append(
            _Purchase(
                date=t.date,
                amount=t.amount,
                bill_id=cycle_service.bill_id_of(t.raw),
                is_payment=t.category_id == card_payment_id and t.amount > 0,
            )
        )
    return result


def card_overview(
    db: Session, account: Account, accounts: list[Account], today: date, cyc: Cycles
) -> dict:
    schedule = cyc.cards.get(account.id)
    card_payment_id = db.scalar(select(Category.id).where(Category.key == "card_payment"))
    purchases = _purchases(db, account, card_payment_id)
    payments = sorted((p for p in purchases if p.is_payment), key=lambda p: p.date)
    used_payments: set[int] = set()

    closed = sorted(account.bills, key=lambda b: b.due_date)
    bills: list[dict] = []
    previous_paid = True
    # Faturas anteriores sem pagamento: o banco as cobra na seguinte, e o pagamento dela as quita
    carried: list[dict] = []
    for n, bill in enumerate(closed):
        items = [p for p in purchases if p.bill_id == bill.external_id and not p.is_payment]
        items_total = -sum((p.amount for p in items), ZERO)
        complete = items_total >= bill.total_amount - PAID_TOLERANCE
        charges = items_total if items and (complete or not previous_paid) else bill.total_amount
        # A anterior só foi cobrada nesta se o total desta passa das compras nesse valor; senão
        # foi paga por fora (ou antes da janela do sync)
        carried_total = sum((b["charges"] for b in carried), ZERO)
        if not items or bill.total_amount - items_total < carried_total - PAID_TOLERANCE:
            carried, carried_total = [], ZERO
        target = charges + carried_total
        paid_at, covered = None, ZERO
        for i, p in enumerate(payments):
            if target <= PAID_TOLERANCE:
                break  # nada a pagar
            if i in used_payments or not (
                bill.due_date - PAYMENT_BEFORE <= p.date <= bill.due_date + PAYMENT_AFTER
            ):
                continue
            used_payments.add(i)
            covered += p.amount
            if paid_at is None and charges > PAID_TOLERANCE and covered >= charges - PAID_TOLERANCE:
                paid_at = p.date
            if covered >= target - PAID_TOLERANCE:
                for previous in carried:
                    previous["paid_at"] = p.date
                carried = []
                break
        previous_paid = paid_at is not None or charges <= PAID_TOLERANCE
        # Fatura não paga é cobrada na seguinte, então só a última fechada pode estar em
        # aberto; as anteriores sem pagamento identificado (pago por outra conta, fora da
        # janela do sync) contam como pagas
        is_latest = n == len(closed) - 1
        settled = paid_at is not None or charges <= PAID_TOLERANCE or not is_latest
        if settled:
            status = "paid"
        else:
            status = "overdue" if bill.due_date < today else "closed"
        close = schedule.close_for_due(bill.due_date) if schedule else bill.due_date
        entry = {
            "id": bill.external_id,
            "status": status,
            "competence": cyc.key_of(close),
            "due_date": bill.due_date,
            "close_date": close,
            "amount": bill.total_amount,
            "charges": charges,
            "minimum_payment": bill.minimum_payment,
            "paid_at": paid_at,
            "purchases": len(items),
        }
        bills.append(entry)
        if not previous_paid:
            carried.append(entry)

    if schedule:
        # Fatura aberta: compras ainda sem fatura que entram na próxima a fechar (parcelas
        # com data futura pertencem a faturas que ainda nem abriram)
        open_close: date | None = schedule.close_on_or_after(schedule.last_close + ONE_DAY)
        open_items = [
            p
            for p in purchases
            if p.bill_id is None
            and not p.is_payment
            and p.date <= today
            and cyc.competence(account.id, p.date, None) == open_close
        ]
        open_amount: Decimal = -sum((p.amount for p in open_items), ZERO)
        open_count: int | None = len(open_items)
        open_due = schedule.next_due_after(open_close)
    else:
        # Banco sem faturas (ou cartão importado por OFX): o saldo do cartão é o que se deve
        open_amount, open_count = -account.balance, None
        open_due = (
            account.bill_due_date
            if account.bill_due_date and account.bill_due_date >= today
            else None
        )
        open_close = account.bill_close_date
    if open_amount > 0:
        bills.append(
            {
                "id": "open",
                "status": "open",
                "competence": cyc.key_of(open_close or today),
                "due_date": open_due,
                "close_date": open_close,
                "amount": open_amount,
                "charges": open_amount,
                "minimum_payment": None,
                "paid_at": None,
                "purchases": open_count,
            }
        )

    estimated_day = schedule.close_on_or_after(today).day if schedule else None
    limit = account.credit_limit
    available = account.available_credit_limit
    used = limit - available if limit is not None and available is not None else -account.balance
    return {
        "account_id": account.id,
        "name": account.name,
        "bank": bank_name(account, accounts),
        "brand": account.card_brand,
        "level": account.card_level,
        "number": account.card_number,
        "credit_limit": limit,
        "available_limit": available,
        "used": used,
        "installments_used": account.installments_limit_used,
        # Fechamento: o escolhido pelo usuário ou o estimado pelas faturas
        "closing_day": account.closing_day,
        "estimated_closing_day": estimated_day,
        "is_cycle_reference": cyc.start_day is None
        and cyc.reference is not None
        and cyc.reference.account_id == account.id,
        # Mais recente primeiro: a aberta, depois as fechadas
        "bills": list(reversed(bills)),
    }


def cards(db: Session, today: date, cyc: Cycles | None = None) -> list[dict]:
    cyc = cyc or cycle_service.load(db)
    accounts = list(db.scalars(select(Account).options(selectinload(Account.bills))))
    return [
        card_overview(db, a, accounts, today, cyc)
        for a in accounts
        if a.type == AccountType.CREDIT_CARD
    ]


def unpaid_bills(card_list: list[dict]) -> list[dict]:
    """Faturas ainda a pagar (aberta, fechada ou vencida), vencimento mais próximo primeiro."""
    pending = [
        {**b, "bank": c["bank"]} for c in card_list for b in c["bills"] if b["status"] != "paid"
    ]
    return sorted(pending, key=lambda b: b["due_date"] or date.max)
