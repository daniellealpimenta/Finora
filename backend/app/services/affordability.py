"""Dá para comprar? A mesma resposta para a lista de desejos e para o Pila.

O modelo do assistente não faz contas (assistant.system_prompt); ele lê o veredito daqui.

Saúde financeira primeiro (`health_check`):
- Reserva de emergência (saldo livre + cofrinhos ÷ gasto médio do mês): abaixo de 3 meses é
  frágil; a meta é 6.
- Compromissos fixos (contas fixas + parcelas ÷ renda média): o ideal é até 30%; acima de 50%
  pesa.

Depois, para um preço (`evaluate`), nesta ordem:
1. "cabe": cabe na folga do ciclo, o que sobra depois da meta de guardar E do seu ritmo do dia a
   dia (forecast_end). Com reserva frágil, só cabe se ainda deixar o ciclo no azul e vira "aperta",
   lembrando que a reserva vem antes.
2. "aperta": cabe no "dá para gastar", mas só segurando o dia a dia; diz quanto por dia sobraria.
3. "nao_cabe": passa do "dá para gastar"; comprar agora come a meta de guardar ou o necessário.

Fora do "cabe", simula parcelamento: a menor quantidade de parcelas (2 a 12) em que a parcela
cabe em metade da folga média do mês (renda média − gasto médio − meta de guardar). Mostra quanto
da renda fica comprometido depois. Se nem em 12x cabe, diz em quantos ciclos dá para juntar
guardando essa mesma metade. Parcelas sem juros: a loja pode cobrar, e isso fica dito.
"""

import math
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.services import analytics, forecast

ZERO = Decimal("0")
_CENTS = Decimal("0.01")
RESERVE_MIN = 3.0
RESERVE_GOAL = 6.0
COMMITMENT_IDEAL = 0.30
COMMITMENT_HEAVY = 0.50
# Parte da folga média do mês que uma parcela nova pode ocupar: a outra metade fica de respiro
ROOM_SHARE = Decimal("0.5")
INSTALLMENT_OPTIONS = (2, 3, 4, 5, 6, 8, 10, 12)


def health_check(summary: dict) -> dict:
    """Situação da saúde financeira e o que fazer, em frases prontas (sem números inventados)."""
    reserve = summary["emergency_reserve_months"]
    commitment = summary["fixed_commitment"]
    score = summary["health"]["score"]
    tips: list[str] = []

    if reserve is None:
        reserve_status = "warn"
    elif reserve < RESERVE_MIN:
        reserve_status = "bad"
        tips.append(
            "A reserva de emergência cobre menos de 3 meses: antes de compras que não são "
            "necessidade, leve a meta de guardar para a reserva."
        )
    elif reserve < RESERVE_GOAL:
        reserve_status = "warn"
        tips.append("A reserva ainda não chegou a 6 meses: vale manter a meta de guardar nela.")
    else:
        reserve_status = "ok"

    if commitment is None:
        commitment_status = "warn"
    elif commitment > COMMITMENT_HEAVY:
        commitment_status = "bad"
        tips.append(
            "Contas fixas e parcelas já levam mais da metade da renda: evite parcelar coisas "
            "novas até alguma parcela acabar."
        )
    elif commitment > COMMITMENT_IDEAL:
        commitment_status = "warn"
        tips.append(
            "Contas fixas e parcelas passam de 30% da renda: parcelamento novo aperta mais. "
            "Prefira juntar e pagar à vista."
        )
    else:
        commitment_status = "ok"

    statuses = {reserve_status, commitment_status}
    status = "bad" if "bad" in statuses else "warn" if "warn" in statuses else "ok"
    return {
        "status": status,
        "score": score,
        "reserve_months": reserve,
        "reserve_status": reserve_status,
        "commitment": commitment,
        "commitment_status": commitment_status,
        "tips": tips,
    }


def context(db: Session, today: date) -> dict:
    """Tudo que a avaliação precisa, calculado uma vez para avaliar vários preços."""
    f = forecast.forecast(db, today)
    s = analytics.summary(db, f["cycle"]["key"], today)
    income = s["avg_monthly_income"] or ZERO
    expense = s["avg_monthly_expense"] or ZERO
    goal = f["savings"]["goal"]
    return {
        "forecast": f,
        "health": health_check(s),
        "income": income,
        "fixed_monthly": s["fixed_monthly"] + s["installments_monthly"],
        # Folga média do mês além da meta de guardar
        "monthly_room": max(income - expense - goal, ZERO).quantize(_CENTS),
    }


def _installments(price: Decimal, ctx: dict) -> dict | None:
    room = (ctx["monthly_room"] * ROOM_SHARE).quantize(_CENTS)
    if room <= 0:
        return None
    income = ctx["income"]
    for n in INSTALLMENT_OPTIONS:
        parcel = (price / n).quantize(_CENTS)
        if parcel <= room:
            before = float(ctx["fixed_monthly"] / income) if income > 0 else None
            after = float((ctx["fixed_monthly"] + parcel) / income) if income > 0 else None
            return {
                "parcelas": n,
                "valor_parcela": parcel,
                "comprometimento_antes": before,
                "comprometimento_depois": after,
                "acima_do_ideal": after is not None and after > COMMITMENT_IDEAL,
            }
    return None


def evaluate(price: Decimal, ctx: dict) -> dict:
    f = ctx["forecast"]
    health = ctx["health"]
    price = Decimal(price).quantize(_CENTS)
    spendable = f["spendable"]
    slack = f["forecast_end"]  # sobra além da meta, já no seu ritmo do dia a dia
    days = f["days_left"]
    fragile = health["reserve_status"] == "bad"

    if price <= slack and not fragile:
        verdict = "cabe"
        title = "Cabe neste ciclo"
        reason = "Cabe na sobra do ciclo, sem mexer na meta de guardar nem no seu dia a dia."
    elif price <= slack:
        verdict = "aperta"
        title = "Cabe, mas a reserva vem antes"
        reason = (
            "Cabe na sobra do ciclo, mas a reserva de emergência cobre menos de 3 meses: "
            "o mais seguro é guardar primeiro."
        )
    elif price <= spendable:
        verdict = "aperta"
        title = "Cabe segurando o dia a dia"
        reason = (
            f"Cabe sem mexer na meta de guardar, mas o dia a dia teria que caber em "
            f"R$ {_brl((spendable - price) / days)} por dia até o fim do ciclo."
            if days
            else "Cabe sem mexer na meta de guardar, mas não sobra nada para o dia a dia."
        )
    else:
        verdict = "nao_cabe"
        title = "Não cabe neste ciclo"
        reason = (
            "Passa do que dá para gastar no ciclo: comprar à vista agora come a meta de "
            "guardar ou o dinheiro do necessário."
        )

    plan = _installments(price, ctx) if verdict != "cabe" else None
    # Juntar é sempre uma alternativa fora do "cabe" (e a recomendada quando parcelar pesa)
    save_up = None
    room = (ctx["monthly_room"] * ROOM_SHARE).quantize(_CENTS)
    if verdict != "cabe" and room > 0:
        save_up = {"por_ciclo": room, "ciclos": math.ceil(price / room)}

    if plan and save_up and (plan["acima_do_ideal"] or health["commitment_status"] != "ok"):
        advice = (
            f"Dá em {plan['parcelas']}x de R$ {_brl(plan['valor_parcela'])}, mas os "
            "compromissos fixos ficariam acima de 30% da renda. Mais seguro juntar: guardando "
            f"R$ {_brl(save_up['por_ciclo'])} por ciclo, junta em {save_up['ciclos']} "
            f"{'ciclo' if save_up['ciclos'] == 1 else 'ciclos'}."
        )
    elif plan:
        advice = (
            f"Parcelado em {plan['parcelas']}x de R$ {_brl(plan['valor_parcela'])} cabe "
            "na folga do mês (se for sem juros; confira com a loja)."
        )
    elif save_up:
        advice = (
            f"Nem em 12x cabe com folga. Guardando R$ {_brl(save_up['por_ciclo'])} por "
            f"ciclo, junta em {save_up['ciclos']} ciclos."
        )
    elif verdict != "cabe":
        advice = "No ritmo atual não sobra folga no mês para parcelar nem para juntar."
    else:
        advice = None

    return {
        "preco": price,
        "veredito": verdict,
        "titulo": title,
        "motivo": reason,
        "recomendacao": advice,
        "parcelamento": plan,
        "juntar": save_up,
    }


def together(items: list[tuple[str, Decimal]], ctx: dict) -> dict:
    """Cada item é avaliado sozinho; aqui, quais cabem juntos na sobra do ciclo, na ordem dada
    (prioridade). Para no primeiro que não cabe: comprar o seguinte "pulando" um mais importante
    não é a recomendação."""
    slack = ctx["forecast"]["forecast_end"]
    if ctx["health"]["reserve_status"] == "bad":
        slack = ZERO  # reserva frágil: nada "cabe com folga" (mesma regra de evaluate)
    chosen: list[str] = []
    total = ZERO
    for name, price in items:
        if total + price > slack:
            break
        chosen.append(name)
        total += price
    return {"itens": chosen, "total": total, "sobra_depois": slack - total}


def _brl(value: Decimal) -> str:
    """1234.5 -> "1.234,50" (o "R$" fica no texto)."""
    text = f"{Decimal(value).quantize(_CENTS):,.2f}"
    return text.replace(",", "X").replace(".", ",").replace("X", ".")
