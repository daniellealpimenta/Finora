"""Padrões nas finanças, encontrados pelo código (não pelo modelo).

Cada padrão vira um item com título e explicação prontos. A tela mostra a lista, e o
assistente a recebe como ferramenta para explicar e cruzar com outras perguntas. Assim os
números vêm sempre do código testado.
"""

from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.db.models import CategoryKind
from app.services import analytics, forecast
from app.services import cycles as cycle_service
from app.services.cycles import shift_key

ZERO = Decimal("0")
# Categoria "subindo": 3 ciclos fechados seguidos, cada um ao menos 10% e R$ 30 acima do anterior
_RISE_RATIO = Decimal("1.10")
_RISE_MIN = Decimal("30")
# Conta fixa que ficou mais cara: última cobrança 10% (e R$ 5) acima da mediana
_PRICE_RATIO = Decimal("1.10")
_PRICE_MIN = Decimal("5")
_FREQUENT_COUNT = 8

_ORDER = {"warn": 0, "info": 1, "good": 2}
_MONTHS = (
    "janeiro fevereiro março abril maio junho julho agosto setembro outubro novembro dezembro"
).split()


def cycle_name(key: str) -> str:
    """ "2026-10" -> "ciclo de outubro de 2026"."""
    year, month = key.split("-")
    return f"ciclo de {_MONTHS[int(month) - 1]} de {year}"


def clean(label: str) -> str:
    """Rótulos de banco vêm com espaços de preenchimento ("CLAUDE SUB    .SAN")."""
    return " ".join(label.split())


def brl(value: Decimal | float) -> str:
    text = f"{abs(Decimal(value)):,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")
    return f"{'−' if value < 0 else ''}R$ {text}"


def _item(kind: str, severity: str, title: str, detail: str) -> dict:
    return {"kind": kind, "severity": severity, "title": title, "detail": detail}


def _budgets_and_anomalies(categories: list[dict]) -> list[dict]:
    out = []
    for c in categories:
        name, spent, budget = c["category_name"], c["spent"], c["budget"]
        if budget and spent > budget:
            out.append(
                _item(
                    "budget_over",
                    "warn",
                    f"{name} passou do orçamento",
                    f"{brl(spent)} gastos neste ciclo, para um orçamento de {brl(budget)} "
                    f"({brl(spent - budget)} acima).",
                )
            )
        elif budget and spent >= budget * Decimal("0.8"):
            out.append(
                _item(
                    "budget_near",
                    "info",
                    f"{name} perto do limite",
                    f"{brl(spent)} de {brl(budget)} ({spent / budget:.0%}) já usados neste ciclo.",
                )
            )
        elif c["anomaly"]:
            out.append(
                _item(
                    "category_spike",
                    "warn",
                    f"{name} acima do normal",
                    f"{brl(spent)} neste ciclo; a média dos 3 anteriores é {brl(c['average'])}.",
                )
            )
    return out


def _rising_categories(rows: list[analytics.Row], closed: list[str]) -> list[dict]:
    """Categorias que subiram nos 3 últimos ciclos fechados seguidos."""
    per: dict[str, dict[str, Decimal]] = defaultdict(lambda: defaultdict(lambda: ZERO))
    for r in rows:
        if r.kind == CategoryKind.EXPENSE and r.cycle in closed:
            per[r.category_name][r.cycle] -= r.amount
    out = []
    for name, by_cycle in per.items():
        values = [by_cycle.get(k, ZERO) for k in closed]
        if all(
            b >= a * _RISE_RATIO and b - a >= _RISE_MIN and a > 0
            for a, b in zip(values, values[1:], strict=False)
        ):
            out.append(
                _item(
                    "category_rising",
                    "warn",
                    f"{name} subindo há {len(values) - 1} ciclos",
                    " → ".join(brl(v) for v in values) + " nos últimos ciclos fechados.",
                )
            )
    return out


def _price_increases(rows: list[analytics.Row], recurring: list[dict]) -> list[dict]:
    """Conta fixa ou assinatura cuja última cobrança ficou mais cara que o normal."""
    last: dict[str, analytics.Row] = {}
    for r in rows:
        if r.kind == CategoryKind.EXPENSE and r.amount < 0:
            key = analytics._normalize(r.label)
            if key not in last or r.posted > last[key].posted:
                last[key] = r
    out = []
    for item in recurring:
        row = last.get(item["key"])
        if row is None:
            continue
        paid, usual = -row.amount, item["monthly_amount"]
        if paid >= usual * _PRICE_RATIO and paid - usual >= _PRICE_MIN:
            out.append(
                _item(
                    "price_up",
                    "warn",
                    f"{clean(item['name'])} ficou mais caro",
                    f"A última cobrança foi {brl(paid)}; o normal era {brl(usual)} por ciclo.",
                )
            )
    return out


def find(db: Session, today: date) -> list[dict]:
    """Padrões do ciclo atual e dos ciclos fechados recentes, os de atenção primeiro."""
    cyc = cycle_service.load(db)
    current = cyc.key_of(today)
    last_closed = shift_key(current, -1)
    closed = [shift_key(current, -i) for i in (4, 3, 2, 1)]
    s = analytics.summary(db, current, today)
    rows = analytics._rows(db, cyc, closed[0], current)
    recurring = analytics.recurring(db, today, cyc=cyc)

    out = _budgets_and_anomalies(analytics.categories_breakdown(db, current))
    out += _rising_categories(rows, closed)
    out += _price_increases(rows, recurring)

    # Algo de todo ciclo que caiu fora do lugar: distorce a comparação entre ciclos
    for key in (last_closed, current):
        notes = s["notes"] if key == current else analytics.summary(db, key, today)["notes"]
        for n in notes:
            if n["kind"] in ("shifted_out", "doubled"):
                shifted = n["kind"] == "shifted_out"
                where = "caiu no ciclo seguinte" if shifted else "caiu duas vezes"
                out.append(
                    _item(
                        "cycle_shift",
                        "info",
                        f"{n['category_name']}: {where}",
                        f"{clean(n['label'])} ({brl(n['amount'])}) no {cycle_name(key)}. "
                        "A comparação com outros ciclos fica distorcida nesse valor.",
                    )
                )

    for m in analytics.top_merchants(db, current, 20):
        if m["count"] >= _FREQUENT_COUNT:
            out.append(
                _item(
                    "frequent",
                    "info",
                    f"{m['count']} compras em {clean(m['name'])}",
                    f"Somam {brl(m['total'])} neste ciclo. Gastos pequenos e frequentes "
                    "costumam passar despercebidos.",
                )
            )

    if recurring:
        fixed = sum((r["monthly_amount"] for r in recurring), ZERO)
        top = ", ".join(clean(r["name"]) for r in recurring[:3])
        out.append(
            _item(
                "fixed_total",
                "info",
                f"Contas fixas: {brl(fixed)} por ciclo",
                f"{len(recurring)} cobranças que se repetem, {brl(fixed * 12)} por ano. "
                f"As maiores: {top}.",
            )
        )

    for i in analytics.installments(db):
        if i["remaining"] == 1:
            out.append(
                _item(
                    "installment_ending",
                    "good",
                    f"{clean(i['name'])} está na última parcela",
                    f"Termina no {cycle_name(i['last_month'])}; depois disso, libera "
                    f"{brl(i['installment_amount'])} por ciclo.",
                )
            )

    reserve = s["emergency_reserve_months"]
    if reserve is not None and reserve < 3:
        out.append(
            _item(
                "reserve_low",
                "warn",
                "Reserva de emergência curta",
                f"Dá para {reserve:.1f} meses de gastos; o ideal é chegar a 6.",
            )
        )
    commitment = s["fixed_commitment"]
    if commitment is not None and commitment > 0.5:
        out.append(
            _item(
                "commitment_high",
                "warn",
                "Muita renda já comprometida",
                f"Contas fixas e parcelas levam {commitment:.0%} da renda média.",
            )
        )
    rate = s["health"]["savings_rate"]
    if rate is not None and rate >= 0.2:
        out.append(
            _item(
                "saving_well",
                "good",
                f"Você guardou {rate:.0%} da renda",
                "Na soma dos 3 últimos ciclos fechados. Acima de 20% é uma boa marca.",
            )
        )

    f = forecast.forecast(db, today)
    if f["spendable"] < 0:
        out.append(
            _item(
                "forecast_short",
                "warn",
                "A previsão do ciclo fecha no vermelho",
                f"Com as entradas e contas previstas, faltam {brl(-f['spendable'])} até o fim "
                "do ciclo.",
            )
        )
    return sorted(out, key=lambda i: _ORDER[i["severity"]])
