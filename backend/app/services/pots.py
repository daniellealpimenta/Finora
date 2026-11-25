"""Saldo dos cofrinhos: o do banco e o informado pelo usuário, trabalhando juntos.

Pelo Open Finance, alguns bancos mandam saldo velho (o PicPay, em novembro de 2026, repetia o
saldo do dia 1º por semanas e não mostrava aportes novos). O usuário pode informar o saldo
que vê no app do banco (`PotCheckin`); nenhum dos dois apaga o outro:

- Vale o mais recente. O informado vale enquanto o banco não mandar um saldo de um dia igual
  ou posterior; daí em diante volta a valer o do banco, e o informado fica de referência.
- Os dois crescem pelo rendimento médio por dia útil do cofrinho até hoje
  (app/services/yields.py), então dá para comparar valores de dias diferentes.
- Quando o banco atualiza, o informado (levado até o dia do banco) é comparado com ele. Passou
  da tolerância: aviso de divergência, até o usuário informar de novo ou aceitar o do banco.
- Dado do banco parado há mais de STALE_BUSINESS_DAYS dias úteis: aviso, e o saldo mostrado é
  o do banco mais o rendimento estimado desde então.

Aportes e resgates que aparecem na conta depois do dia do saldo do banco (`unreflected_flows`)
não são distribuídos entre os cofrinhos: o extrato não diz para qual cofrinho foram.
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db.models import (
    Account,
    AccountType,
    Category,
    Connection,
    Investment,
    PotCheckin,
    SavingsPot,
    Transaction,
)
from app.services import yields
from app.services.cards import short_bank_name
from app.services.yields import business_days

ZERO = Decimal("0")
_CENTS = Decimal("0.01")
# Diferença aceitável entre o informado e o banco: R$ 10 ou 1%, o que for maior
TOLERANCE_MIN = Decimal("10")
TOLERANCE_RATIO = Decimal("0.01")
STALE_BUSINESS_DAYS = 3


@dataclass
class PotState:
    balance: Decimal  # o que o app mostra como saldo de hoje
    source: str  # "bank", "estimate" (banco + rendimento) ou "manual"
    bank_balance: Decimal
    bank_as_of: date | None  # dia do saldo do banco (None = sem a informação)
    stale: bool
    checkin: PotCheckin | None  # o último informado ainda ativo
    # Banco atualizou depois do informado e não bateu: banco − informado levado ao dia do banco
    divergence: Decimal | None = None
    expected: Decimal | None = None  # o informado levado ao dia do banco


def tolerance(amount: Decimal) -> Decimal:
    return max(TOLERANCE_MIN, abs(amount) * TOLERANCE_RATIO)


def _grow(amount: Decimal, average: Decimal, start: date, end: date) -> Decimal:
    return (amount + average * business_days(start, end)).quantize(_CENTS)


def active_checkin(pot: SavingsPot) -> PotCheckin | None:
    live = [c for c in pot.checkins if not c.dismissed]
    return max(live, key=lambda c: (c.day, c.id)) if live else None


def bank_as_of(pot: SavingsPot, today: date) -> date | None:
    """Dia do saldo do banco: a data informada pela Pluggy ou, sem ela, o último dia em que o
    saldo mudou nos registros diários."""
    dates = [i.balance_date for i in pot.investments if i.balance_date]
    if dates:
        return max(dates)
    frozen_since, _ = yields.frozen_estimate(pot, today)
    return frozen_since


def state(pot: SavingsPot, today: date) -> PotState:
    bank = sum((i.balance for i in pot.investments), ZERO)
    as_of = bank_as_of(pot, today)
    reference = as_of or today
    stale = as_of is not None and business_days(as_of, today) > STALE_BUSINESS_DAYS
    # Rendimento médio por dia útil; negativo (resgate parcial bagunçando o aplicado) não
    # encolhe o que o usuário informou
    average = max(
        yields.pot_yields(pot, today, limit=0)["average_per_business_day"]
        if pot.investments
        else ZERO,
        ZERO,
    )
    checkin = active_checkin(pot)

    if checkin is not None and checkin.day >= reference:
        return PotState(
            balance=_grow(checkin.amount, average, checkin.day, today),
            source="manual",
            bank_balance=bank,
            bank_as_of=as_of,
            stale=stale,
            checkin=checkin,
        )

    balance, source = bank, "bank"
    if stale:
        grown = _grow(bank, average, as_of, today)
        if grown != bank:
            balance, source = grown, "estimate"
    result = PotState(
        balance=balance,
        source=source,
        bank_balance=bank,
        bank_as_of=as_of,
        stale=stale,
        checkin=checkin,
    )
    if checkin is not None:
        expected = _grow(checkin.amount, average, checkin.day, reference)
        diff = bank - expected
        result.expected = expected
        if abs(diff) > tolerance(expected):
            result.divergence = diff
    return result


def states(db: Session, today: date) -> dict[int, PotState]:
    pots = db.scalars(
        select(SavingsPot).options(
            selectinload(SavingsPot.investments).selectinload(Investment.snapshots),
            selectinload(SavingsPot.checkins),
        )
    )
    return {p.id: state(p, today) for p in pots}


def total_saved(db: Session, today: date) -> Decimal:
    """Guardado em cofrinhos hoje: o saldo que vale de cada cofrinho mais as aplicações soltas."""
    in_pots = sum((s.balance for s in states(db, today).values()), ZERO)
    loose = sum(
        (i.balance for i in db.scalars(select(Investment).where(Investment.pot_id.is_(None)))),
        ZERO,
    )
    return in_pots + loose


def add_checkin(db: Session, pot: SavingsPot, amount: Decimal, day: date) -> PotCheckin:
    checkin = PotCheckin(pot=pot, amount=amount.quantize(_CENTS), day=day)
    db.add(checkin)
    db.flush()
    return checkin


def accept_bank(pot: SavingsPot) -> None:
    """Usuário aceita o valor do banco: os informados deixam de valer e de ser comparados."""
    for c in pot.checkins:
        c.dismissed = True


def unreflected_flows(db: Session, today: date) -> list[dict]:
    """Aportes e resgates no extrato depois do dia do saldo do banco, por instituição.

    É o que explica a diferença quando o banco manda o saldo dos cofrinhos atrasado.
    """
    investments_cat = db.scalar(select(Category.id).where(Category.key == "investments"))
    if investments_cat is None:
        return []
    out = []
    for conn in db.scalars(select(Connection)):
        dates = [i.balance_date for i in conn.investments if i.balance_date]
        if not dates:
            continue
        as_of = max(dates)
        if business_days(as_of, today) < 1:
            continue
        accounts = [
            a for a in conn.accounts if a.type in (AccountType.CHECKING, AccountType.SAVINGS)
        ]
        if not accounts:
            continue
        rows = list(
            db.scalars(
                select(Transaction).where(
                    Transaction.account_id.in_([a.id for a in accounts]),
                    Transaction.category_id == investments_cat,
                    Transaction.date > as_of,
                )
            )
        )
        if not rows:
            continue
        deposits = -sum((t.amount for t in rows if t.amount < 0), ZERO)
        withdrawals = sum((t.amount for t in rows if t.amount > 0), ZERO)
        out.append(
            {
                "connection_id": conn.id,
                "bank": _bank_name(conn, accounts),
                "since": as_of,
                "deposits": deposits,
                "withdrawals": withdrawals,
                "net": deposits - withdrawals,
                "count": len(rows),
            }
        )
    return out


def _bank_name(conn: Connection, accounts: list[Account]) -> str:
    if conn.institution_name and conn.institution_name != "MeuPluggy":
        return conn.institution_name
    return short_bank_name(accounts[0].name)
