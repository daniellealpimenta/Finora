"""Previsão do fim do ciclo atual, para planejar.

  livre agora
+ entradas previstas que ainda não caíram
− dízimo que falta
− o que falta da meta de guardar (padrão: 20% do que entra no ciclo)
− contas fixas e parcelas que ainda não caíram
= dá para gastar no dia a dia (spendable) e ainda cumprir a meta
− gastos do dia a dia, no ritmo dos ciclos anteriores
= folga além da meta (forecast_end)

Fechar o ciclo "no zero" não é saudável: a meta de guardar entra antes de dizer quanto dá para
gastar. O dinheiro da meta pode ir para o cofrinho ou ficar na conta; os dois contam.

- Entradas previstas: o salário (mediana por ciclo nos 3 ciclos anteriores) e entradas que se
  repetem (mesma descrição e valor parecido em pelo menos 3 dos 4 ciclos anteriores, a partir
  de R$ 50). O usuário pode dizer até quando cada uma conta, ou ignorá-la.
- Dízimo: % sobre (o que sobrou até o ciclo anterior + tudo que entra no ciclo), menos o que
  já foi doado no ciclo.
- Meta de guardar: % do que entra no ciclo (o que já entrou + o previsto) ou um valor fixo,
  menos o já guardado (aportes − resgates; a parte de quem divide o cofrinho se anula).
- Parcelas: compras parceladas em andamento cuja parcela ainda não entrou na fatura do ciclo.
- Contas fixas: recorrentes (analytics.recurring) que ainda não apareceram no ciclo. Doações
  recorrentes contam aqui quando o dízimo está desligado (com dízimo, ele já as cobre).
- Até a próxima entrada: o que está livre agora menos as contas fixas que vencem antes dela.
  O salário do fim do mês não ajuda a pagar o que vence antes dele.
- Dia a dia: gasto médio por dia dos 3 ciclos anteriores que têm lançamentos, sem contas fixas,
  dízimo e parcelas (analytics.typical_daily_variable).
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
# Meta de guardar: "rate" (% do que entra no ciclo) ou "amount" (R$ fixo por ciclo). 20% é a
# referência da regra 50/30/20 (necessidades / desejos / guardar).
DEFAULT_SAVINGS_RATE = 0.2
DEFAULT_PLANNING: dict = {
    "tithe_rate": 0.0,
    "savings_mode": "rate",
    "savings_rate": DEFAULT_SAVINGS_RATE,
    "savings_goal": 0.0,
    "incomes": {},
}
MIN_RECURRING_INCOME = Decimal("50")
# Uma entrada que se repete pode variar até 15% em torno da mediana
INCOME_TOLERANCE = Decimal("0.15")
_CENTS = Decimal("0.01")


def get_planning(db: Session) -> dict:
    setting = db.get(AppSetting, PLANNING_KEY)
    saved = setting.value if setting else {}
    planning = {**DEFAULT_PLANNING, **saved}
    # Quem já tinha uma meta em R$ (antes do modo %) continua com ela
    if "savings_mode" not in saved and float(saved.get("savings_goal") or 0) > 0:
        planning["savings_mode"] = "amount"
    return planning


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

    # --- dízimo e meta de guardar -------------------------------------------------------------
    rate = Decimal(str(planning.get("tithe_rate") or 0))
    tithe_base = flow["started_with"] + flow["income"] + income_left
    given = -sum((r.amount for r in current if r.category_key == "donations"), ZERO)
    tithe_left = max(rate * tithe_base - given, ZERO).quantize(_CENTS)
    cycle_income = flow["income"] + income_left
    mode = planning.get("savings_mode") or "rate"
    savings_rate = Decimal(str(planning.get("savings_rate") or 0))
    if mode == "amount":
        goal = Decimal(str(planning.get("savings_goal") or 0)).quantize(_CENTS)
    else:
        goal = (savings_rate * max(cycle_income, ZERO)).quantize(_CENTS)
    savings_left = max(goal - flow["saved"], ZERO).quantize(_CENTS)

    # --- contas fixas que ainda não caíram ---------------------------------------------------
    # Com dízimo ligado, as doações já estão nele; sem dízimo, a doação recorrente é conta fixa
    donation_keys = (
        {analytics._normalize(r.label) for r in history if r.category_key == "donations"}
        if rate > 0
        else set()
    )
    seen = {analytics._normalize(r.label) for r in current if r.kind == CategoryKind.EXPENSE}
    recurring = analytics.recurring(db, today, cyc=cyc)
    fixed = [
        {
            "name": r["name"],
            "amount": r["monthly_amount"],
            "expected_date": _expected_date(r["last_date"].day, start, end, today),
        }
        for r in recurring
        if r["key"] not in seen and r["key"] not in donation_keys
    ]
    fixed_left = sum((f["amount"] for f in fixed), ZERO)

    # --- parcelas que ainda vão entrar na fatura deste ciclo ------------------------------------
    def plain(label: str) -> str:
        return analytics._normalize(analytics._INSTALLMENT_MARK.sub("", label))

    posted = {plain(r.label) for r in current if r.installment}
    pending_installments = [
        {"name": i["name"], "amount": i["installment_amount"]}
        for i in analytics.installments(db)
        if plain(i["name"]) not in posted
    ]
    installments_left = sum((i["amount"] for i in pending_installments), ZERO)

    # --- dia a dia, no ritmo dos 3 ciclos anteriores -------------------------------------------
    recurring_keys = {r["key"] for r in recurring} | donation_keys
    daily_typical = analytics.typical_daily_variable(
        cyc, key, history, recurring_keys, frozenset({"donations"})
    )
    days_left = max((end - today).days, 0)
    variable_left = (daily_typical * days_left).quantize(_CENTS)

    available = flow["ended_with"]
    spendable = available + income_left - tithe_left - savings_left - fixed_left - installments_left
    result = spendable - variable_left

    # --- até a próxima entrada: o dinheiro de agora precisa durar até ela ----------------------
    upcoming = sorted(
        (i for i in incomes if i["remaining"] > 0 and i["expected_date"]),
        key=lambda i: i["expected_date"],
    )
    until_income = None
    if upcoming:
        nxt = upcoming[0]
        due_before = sum(
            (
                f["amount"]
                for f in fixed
                if f["expected_date"] and f["expected_date"] < nxt["expected_date"]
            ),
            ZERO,
        )
        days = max((nxt["expected_date"] - today).days, 1)
        free = available - due_before
        until_income = {
            "label": nxt["label"],
            "date": nxt["expected_date"],
            "days": days,
            "fixed_before": due_before,
            "free": free,
            "daily": (free / days).quantize(_CENTS),
        }

    return {
        "cycle": analytics.cycle_info(cyc, key, today),
        "days_left": days_left,
        "available_now": available,
        "incomes": incomes,
        "income_left": income_left,
        "cycle_income": cycle_income,
        "tithe": {"rate": float(rate), "base": tithe_base, "given": given, "left": tithe_left},
        "savings": {
            "mode": mode,
            "rate": float(savings_rate),
            "goal": goal,
            "saved": flow["saved"],
            "left": savings_left,
            # Referência: quanto foi guardado nos 3 últimos ciclos fechados
            "history_rate": analytics._savings_rate_closed(db, cyc, key, today),
        },
        "fixed": fixed,
        "fixed_left": fixed_left,
        "installments": pending_installments,
        "installments_left": installments_left,
        "daily_typical": daily_typical,
        "variable_left": variable_left,
        # Quanto dá para gastar no dia a dia até o fim do ciclo (no total e por dia) e ainda
        # cumprir a meta de guardar
        "spendable": spendable,
        "daily_allowance": (spendable / days_left).quantize(_CENTS) if days_left else None,
        # No seu ritmo: o que sobra além da meta (negativo = o ritmo come parte da meta)
        "forecast_end": result,
        "until_income": until_income,
    }
