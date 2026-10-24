"""Rendimento dos cofrinhos: quanto rende por dia.

Duas fontes, porque a Pluggy só manda o saldo de hoje:
- Média desde a aplicação: (saldo − aplicado) ÷ dias úteis desde a compra. Existe desde já,
  para cada aplicação, e estima quanto o cofrinho rende num dia útil de hoje.
- Dia a dia: o saldo de cada aplicação é gravado a cada sync (InvestmentSnapshot). O que o
  lucro (saldo − aplicado) cresceu entre dois registros é o que rendeu naquele intervalo.
  Começa a contar a partir do primeiro registro.

Renda fixa só rende em dia útil; feriados não são descontados (a média fica um pouco menor).
"""

from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Investment, InvestmentSnapshot, SavingsPot

ZERO = Decimal("0")
_CENTS = Decimal("0.01")


def _applied(i: Investment | InvestmentSnapshot) -> Decimal:
    return i.amount_original if i.amount_original is not None else i.balance


def record_snapshots(db: Session, day: date) -> int:
    """Grava (ou atualiza) o saldo de hoje de cada aplicação. Chamado no fim do sync."""
    existing = {
        s.investment_id: s
        for s in db.scalars(select(InvestmentSnapshot).where(InvestmentSnapshot.day == day))
    }
    count = 0
    for inv in db.scalars(select(Investment)):
        snap = existing.get(inv.id)
        if snap is None:
            db.add(
                InvestmentSnapshot(
                    investment_id=inv.id,
                    day=day,
                    balance=inv.balance,
                    amount_original=inv.amount_original,
                )
            )
        else:
            snap.balance, snap.amount_original = inv.balance, inv.amount_original
        count += 1
    return count


def business_days(start: date, end: date) -> int:
    """Dias úteis (seg a sex) em (start, end]."""
    if end <= start:
        return 0
    days = (end - start).days
    weeks, rest = divmod(days, 7)
    count = weeks * 5
    for i in range(1, rest + 1):
        if (start + timedelta(days=weeks * 7 + i)).weekday() < 5:
            count += 1
    return count


def pot_yields(pot: SavingsPot, today: date, limit: int = 30) -> dict:
    investments = list(pot.investments)
    # Média por dia útil de cada aplicação, somadas: quanto o cofrinho rende num dia útil
    average = ZERO
    for inv in investments:
        bdays = business_days(inv.purchase_date, today) if inv.purchase_date else 0
        if bdays:
            average += (inv.balance - _applied(inv)) / bdays

    # Lucro de cada aplicação em cada dia registrado
    profit: dict[date, dict[int, Decimal]] = defaultdict(dict)
    for inv in investments:
        for s in inv.snapshots:
            profit[s.day][inv.id] = s.balance - _applied(s)
    days = sorted(profit)
    daily = []
    for prev, day in zip(days, days[1:], strict=False):
        # Só o que existia nos dois dias; aplicação nova entra com o que já rendeu
        earned = sum(
            (value - profit[prev].get(inv_id, ZERO) for inv_id, value in profit[day].items()),
            ZERO,
        )
        daily.append(
            {
                "day": day,
                "since": prev,
                "days": (day - prev).days,
                "business_days": business_days(prev, day),
                "earned": earned.quantize(_CENTS),
            }
        )
    return {
        "average_per_business_day": average.quantize(_CENTS),
        "tracking_since": days[0] if days else None,
        "daily": list(reversed(daily))[:limit],
    }
