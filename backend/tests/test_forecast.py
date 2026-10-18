from datetime import date
from decimal import Decimal

from sqlalchemy import select

from app.db.models import Account, AccountType, Category, Transaction, TransactionSource
from app.services import forecast
from app.services.categories import ensure_categories

# Sem cartão com faturas: o ciclo é o mês do calendário
TODAY = date(2026, 10, 16)


def _setup(db):
    ensure_categories(db)
    cat = {c.key: c.id for c in db.scalars(select(Category))}
    checking = Account(name="Conta", type=AccountType.CHECKING, balance=Decimal("800"))
    db.add(checking)
    db.flush()
    n = 0

    def add(d, amount, key, desc):
        nonlocal n
        n += 1
        db.add(
            Transaction(
                account_id=checking.id,
                external_id=f"t{n}",
                source=TransactionSource.MANUAL,
                date=d,
                amount=Decimal(amount),
                description=desc,
                category_id=cat[key],
            )
        )

    for month in (6, 7, 8, 9):
        add(date(2026, month, 6), "1500", "transfers_in", "PIX recebido")
        add(date(2026, month, 3), "-55.90", "subscriptions", "NETFLIX")
        # Mercado varia de valor: dia a dia, não conta fixa
        add(
            date(2026, month, 15),
            f"-{ {6: 300, 7: 200, 8: 450, 9: 250}[month] }",
            "groceries",
            "MERCADO",
        )
        add(date(2026, month, 16), "-500", "donations", "IGREJA")
    for month, salary in ((7, "3000"), (8, "3100"), (9, "3900")):  # setembro com PLR
        add(date(2026, month, 28), salary, "salary", "FOLHA")
    add(date(2026, 9, 20), "37", "transfers_in", "PIX recebido")  # pequeno: não é fixo
    # Outubro até agora: Pix já caiu, Netflix já cobrou, 200 de dízimo dados
    add(date(2026, 10, 6), "1500", "transfers_in", "PIX recebido")
    add(date(2026, 10, 3), "-55.90", "subscriptions", "NETFLIX")
    add(date(2026, 10, 10), "-200", "donations", "IGREJA")
    db.commit()


def test_forecast_projects_incomes_goals_and_daily_spending(db):
    _setup(db)
    forecast.save_planning(db, {"tithe_rate": 0.1, "savings_goal": 1000, "incomes": {}})

    f = forecast.forecast(db, TODAY)

    incomes = {i["key"]: i for i in f["incomes"]}
    assert set(incomes) == {"salary", "pix recebido|1500"}
    # Mediana dos 3 ciclos anteriores: a PLR de setembro não infla a previsão
    assert incomes["salary"]["remaining"] == Decimal("3100.00")
    assert incomes["salary"]["expected_date"] == date(2026, 10, 28)
    assert incomes["pix recebido|1500"]["remaining"] == 0  # já caiu neste ciclo
    # Dízimo: 10% de (começou com + entradas do ciclo + previstas) − 200 já dados
    assert f["tithe"]["left"] == (f["tithe"]["base"] * Decimal("0.1") - 200).quantize(
        Decimal("0.01")
    )
    assert f["savings"]["left"] == Decimal("1000.00")
    # Netflix já cobrou: nada de contas fixas pendentes
    assert f["fixed"] == []
    # Dia a dia: o mercado de 300 por ciclo, nem dízimo nem Netflix
    assert f["daily_typical"] == (Decimal("900") / 92).quantize(Decimal("0.01"))
    expected_end = (
        f["available_now"]
        + f["income_left"]
        - f["tithe"]["left"]
        - f["savings"]["left"]
        - f["variable_left"]
    )
    assert f["forecast_end"] == expected_end
    # Total para o dia a dia = o que sobra depois das previsões; por dia = total ÷ dias
    assert f["spendable"] == expected_end + f["variable_left"]
    assert f["daily_allowance"] == (f["spendable"] / f["days_left"]).quantize(Decimal("0.01"))


def test_income_stops_counting_after_its_last_cycle(db):
    _setup(db)
    forecast.save_planning(
        db,
        {"tithe_rate": 0, "savings_goal": 0, "incomes": {"salary": {"until": "2026-09"}}},
    )

    f = forecast.forecast(db, TODAY)

    salary = next(i for i in f["incomes"] if i["key"] == "salary")
    assert salary["counted"] is False and salary["remaining"] == 0
