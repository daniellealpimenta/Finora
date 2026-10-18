"""Previsão do fim do ciclo atual, para planejar.

  livre agora
+ entradas previstas que ainda não caíram
− dízimo que falta
− o que falta guardar no cofrinho
− contas fixas que ainda não caíram
− gastos do dia a dia, no ritmo dos ciclos anteriores
= previsão do fim do ciclo (com o que o próximo ciclo começaria)

- Entradas previstas: o salário (mediana por ciclo nos 3 ciclos anteriores) e entradas que se
  repetem (mesma descrição e valor parecido em pelo menos 3 dos 4 ciclos anteriores, a partir
  de R$ 50). O usuário pode dizer até quando cada uma conta, ou ignorá-la.
- Dízimo: % sobre (o que sobrou até o ciclo anterior + tudo que entra no ciclo), menos o que
  já foi doado no ciclo.
- Cofrinho: meta por ciclo menos o já guardado (aportes − resgates; a parte de quem divide o
  cofrinho compartilhado se anula).
- Contas fixas: recorrentes (analytics.recurring) que ainda não apareceram no ciclo.
- Dia a dia: gasto médio por dia dos 3 ciclos anteriores, sem contas fixas, dízimo e parcelas.
"""

import statistics
from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Account, AppSetting, CategoryKind
from app.services import analytics
from app.services import cards as card_service
from app.services import cycles as cycle_service
from app.services.cycles import ONE_DAY, shift_key

ZERO = Decimal("0")
PLANNING_KEY = "planning"
DEFAULT_PLANNING: dict = {"tithe_rate": 0.0, "savings_goal": 0.0, "incomes": {}}
MIN_RECURRING_INCOME = Decimal("50")
# Uma entrada que se repete pode variar até 15% em torno da mediana
INCOME_TOLERANCE = Decimal("0.15")
_CENTS = Decimal("0.01")


def get_planning(db: Session) -> dict:
    setting = db.get(AppSetting, PLANNING_KEY)
    return {**DEFAULT_PLANNING, **(setting.value if setting else {})}


def save_planning(db: Session, value: dict) -> dict:
    setting = db.get(AppSetting, PLANNING_KEY)
    if setting is None:
        setting = AppSetting(key=PLANNING_KEY, value=value)
        db.add(setting)
    else:
        setting.value = value
    db.commit()
    return get_planning(db)


def _median_day(dates: list[date]) -> int | None:
    return round(statistics.median(d.day for d in dates)) if dates else None


def _expected_date(day: int | None, start: date, end: date, today: date) -> date | None:
    """Próxima data com esse dia do mês dentro do ciclo, de hoje em diante."""
    if day is None:
        return None
    for month_start in (start.replace(day=1), (end - ONE_DAY).replace(day=1)):
        candidate = cycle_service.clamp_day(month_start.year, month_start.month, day)
        if start <= candidate < end and candidate >= today:
            return candidate
    return None


def _income_groups(rows: list[analytics.Row]) -> dict[str, list[analytics.Row]]:
    """Entradas agrupadas pelo que as identifica: o salário junto; as demais por descrição e
    valor arredondado (o Pix de R$ 1.500 não se mistura com um Pix de R$ 36)."""
    groups: dict[str, list[analytics.Row]] = defaultdict(list)
    for r in rows:
        if r.kind != CategoryKind.INCOME or r.amount <= 0:
            continue
        if r.category_key == "salary":
            groups["salary"].append(r)
        elif r.amount >= MIN_RECURRING_INCOME:
            bucket = (r.amount / 50).quantize(Decimal("1")) * 50
            groups[f"{analytics._normalize(r.label)}|{bucket}"].append(r)
    return groups


def forecast(db: Session, today: date) -> dict:
    cyc = cycle_service.load(db)
    key = cyc.key_of(today)
    start, end = cyc.bounds(key)
    planning = get_planning(db)
    overrides: dict = planning.get("incomes") or {}

    liquid = sum(
        (a.balance for a in db.scalars(select(Account)) if a.type in analytics.LIQUID_ACCOUNTS),
        ZERO,
    )
    card_list = card_service.cards(db, today, cyc)
    flow = analytics.cycle_flow(db, cyc, key, today, card_list, liquid)
    current = analytics._rows(db, cyc, key)
    history = analytics._rows(db, cyc, shift_key(key, -4), shift_key(key, -1))
    last3 = {shift_key(key, -i) for i in (1, 2, 3)}

    # --- entradas previstas --------------------------------------------------------------
    current_groups = _income_groups(current)
    incomes = []
    for group, rows in _income_groups(history).items():
        per_cycle: dict[str, Decimal] = defaultdict(lambda: ZERO)
        for r in rows:
            per_cycle[r.cycle] += r.amount
        if group == "salary":
            values = [v for k, v in per_cycle.items() if k in last3]
            if not values:
                continue
        else:
            values = list(per_cycle.values())
            median = statistics.median(values)
            if len(values) < 3 or any(abs(v - median) > median * INCOME_TOLERANCE for v in values):
                continue
        expected = statistics.median(values).quantize(_CENTS)
        received = sum((r.amount for r in current_groups.get(group, [])), ZERO)
        override = overrides.get(group) or {}
        until = override.get("until")
        counted = not override.get("ignore") and (until is None or key <= until)
        last = max(rows, key=lambda r: r.posted)
        incomes.append(
            {
                "key": group,
                "label": "Salário" if group == "salary" else last.label,
                "expected": expected,
                "received": received,
                "remaining": max(expected - received, ZERO) if counted else ZERO,
                "expected_date": _expected_date(
                    _median_day([r.posted for r in rows]), start, end, today
                ),
                "until": until,
                "ignored": bool(override.get("ignore")),
                "counted": counted,
            }
        )
    incomes.sort(key=lambda i: i["expected"], reverse=True)
    income_left = sum((i["remaining"] for i in incomes), ZERO)

    # --- dízimo e cofrinho -----------------------------------------------------------------
    rate = Decimal(str(planning.get("tithe_rate") or 0))
    tithe_base = flow["started_with"] + flow["income"] + income_left
    given = -sum((r.amount for r in current if r.category_key == "donations"), ZERO)
    tithe_left = max(rate * tithe_base - given, ZERO).quantize(_CENTS)
    goal = Decimal(str(planning.get("savings_goal") or 0))
    savings_left = max(goal - flow["saved"], ZERO).quantize(_CENTS)

    # --- contas fixas que ainda não caíram ---------------------------------------------------
    donation_keys = {
        analytics._normalize(r.label) for r in history if r.category_key == "donations"
    }
    seen = {analytics._normalize(r.label) for r in current if r.kind == CategoryKind.EXPENSE}
    recurring = analytics.recurring(db, today, cyc=cyc)
    fixed = [
        {"name": r["name"], "amount": r["monthly_amount"]}
        for r in recurring
        if r["key"] not in seen and r["key"] not in donation_keys
    ]
    fixed_left = sum((f["amount"] for f in fixed), ZERO)

    # --- dia a dia, no ritmo dos 3 ciclos anteriores -------------------------------------------
    recurring_keys = {r["key"] for r in recurring} | donation_keys
    past_days = sum(((cyc.bounds(k)[1] - cyc.bounds(k)[0]).days for k in last3), 0)
    variable_past = -sum(
        (
            r.amount
            for r in history
            if r.cycle in last3
            and r.kind == CategoryKind.EXPENSE
            and not r.installment
            and r.category_key != "donations"
            and analytics._normalize(r.label) not in recurring_keys
        ),
        ZERO,
    )
    daily_typical = (variable_past / past_days).quantize(_CENTS) if past_days else ZERO
    days_left = max((end - today).days, 0)
    variable_left = (daily_typical * days_left).quantize(_CENTS)

    available = flow["ended_with"]
    spendable = available + income_left - tithe_left - savings_left - fixed_left
    result = spendable - variable_left
    return {
        "cycle": analytics.cycle_info(cyc, key, today),
        "days_left": days_left,
        "available_now": available,
        "incomes": incomes,
        "income_left": income_left,
        "tithe": {"rate": float(rate), "base": tithe_base, "given": given, "left": tithe_left},
        "savings": {"goal": goal, "saved": flow["saved"], "left": savings_left},
        "fixed": fixed,
        "fixed_left": fixed_left,
        "daily_typical": daily_typical,
        "variable_left": variable_left,
        # Quanto dá para gastar no dia a dia até o fim do ciclo (no total e por dia) e ainda
        # fechar o ciclo no zero
        "spendable": spendable,
        "daily_allowance": (spendable / days_left).quantize(_CENTS) if days_left else None,
        "forecast_end": result,
    }
