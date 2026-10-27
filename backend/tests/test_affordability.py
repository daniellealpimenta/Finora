from decimal import Decimal

from app.services import affordability

D = Decimal


def _summary(reserve=6.9, commitment=0.25, score=80):
    return {
        "emergency_reserve_months": reserve,
        "fixed_commitment": commitment,
        "health": {"score": score},
    }


def _ctx(
    spendable="2000",
    slack="800",
    days=10,
    reserve=6.9,
    commitment=0.25,
    room="1000",
    income="8000",
    fixed="2000",
):
    return {
        "forecast": {"spendable": D(spendable), "forecast_end": D(slack), "days_left": days},
        "health": affordability.health_check(_summary(reserve, commitment)),
        "income": D(income),
        "fixed_monthly": D(fixed),
        "monthly_room": D(room),
    }


def test_health_ok_without_tips():
    h = affordability.health_check(_summary())
    assert h["status"] == "ok" and h["tips"] == []


def test_health_flags_low_reserve_and_heavy_commitment():
    h = affordability.health_check(_summary(reserve=2, commitment=0.55))
    assert h["reserve_status"] == "bad" and h["commitment_status"] == "bad"
    assert h["status"] == "bad" and len(h["tips"]) == 2


def test_fits_in_cycle_slack():
    r = affordability.evaluate(D("500"), _ctx())
    assert r["veredito"] == "cabe"
    assert r["parcelamento"] is None and r["recomendacao"] is None


def test_tight_says_daily_left():
    # 2000 − 1500 = 500 em 10 dias: R$ 50,00 por dia
    r = affordability.evaluate(D("1500"), _ctx())
    assert r["veredito"] == "aperta"
    assert "R$ 50,00 por dia" in r["motivo"]


def test_low_reserve_downgrades_fit():
    r = affordability.evaluate(D("500"), _ctx(reserve=2))
    assert r["veredito"] == "aperta"
    assert "reserva" in r["titulo"].lower()


def test_installments_pick_fewest_that_fit_half_the_room():
    # Metade da folga = 500: 3000 em 6x de 500
    r = affordability.evaluate(D("3000"), _ctx())
    assert r["veredito"] == "nao_cabe"
    plan = r["parcelamento"]
    assert plan["parcelas"] == 6 and plan["valor_parcela"] == D("500.00")
    # (2000 + 500) ÷ 8000
    assert plan["comprometimento_depois"] == 0.3125 and plan["acima_do_ideal"]
    # Parcelar passaria do ideal: recomenda juntar, dizendo em quanto tempo (3000 ÷ 500)
    assert "Mais seguro juntar" in r["recomendacao"] and "junta em 6 ciclos" in r["recomendacao"]


def test_installments_within_ideal_recommend_parcelar():
    r = affordability.evaluate(D("2400"), _ctx(fixed="1000"))
    assert r["parcelamento"]["parcelas"] == 5  # 480 <= 500
    assert r["recomendacao"].startswith("Parcelado em 5x")


def test_too_expensive_suggests_saving_up():
    # 12x de 1000 > 500: junta em ceil(12000 / 500) = 24 ciclos
    r = affordability.evaluate(D("12000"), _ctx())
    assert r["parcelamento"] is None
    assert r["juntar"] == {"por_ciclo": D("500.00"), "ciclos": 24}


def test_no_room_means_no_plan():
    r = affordability.evaluate(D("3000"), _ctx(room="0"))
    assert r["parcelamento"] is None and r["juntar"] is None
    assert "não sobra folga" in r["recomendacao"]


def test_together_stops_at_first_that_does_not_fit():
    # Sobra 800: 300 + 400 = 700 cabem; 200 depois de um que não cabe não entra
    items = [("a", D("300")), ("b", D("400")), ("c", D("500")), ("d", D("50"))]
    r = affordability.together(items, _ctx())
    assert r["itens"] == ["a", "b"] and r["sobra_depois"] == D("100")


def test_together_nothing_with_fragile_reserve():
    assert affordability.together([("a", D("10"))], _ctx(reserve=2))["itens"] == []
