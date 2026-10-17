from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.db.models import (
    Account,
    AccountType,
    Category,
    Transaction,
    TransactionSource,
    TransactionStatus,
)
from app.services import analytics
from app.services.categories import ensure_categories

TODAY = date(2026, 10, 15)


@pytest.fixture
def data(db):
    """Jul-Out/2026: salário 5000, Netflix 55,90, mercado 800/mês (out: 1500 - estorno 100),
    pagamento de fatura 700 (transferência) e uma parcela futura de 200 em novembro."""
    ensure_categories(db)
    cat = {c.key: c.id for c in db.scalars(select(Category))}
    checking = Account(name="Corrente", type=AccountType.CHECKING, balance=Decimal("10000"))
    card = Account(name="Cartão", type=AccountType.CREDIT_CARD, balance=Decimal("-500"))
    db.add_all([checking, card])
    db.flush()

    n = 0

    def add(account, d, amount, key, desc, status=TransactionStatus.POSTED):
        nonlocal n
        n += 1
        db.add(
            Transaction(
                account_id=account.id,
                external_id=f"t{n}",
                source=TransactionSource.MANUAL,
                date=d,
                amount=Decimal(amount),
                description=desc,
                category_id=cat[key],
                status=status,
            )
        )

    for month in (7, 8, 9, 10):
        add(checking, date(2026, month, 5), "5000", "salary", "SALARIO ACME")
        add(card, date(2026, month, 1), "-55.90", "subscriptions", f"NETFLIX.COM {month}")
        add(checking, date(2026, month, 20), "-700", "card_payment", "PAGTO FATURA")
        if month < 10:
            add(card, date(2026, month, 10), "-800", "groceries", "SUPERMERCADO BOM")
    add(card, date(2026, 10, 10), "-1500", "groceries", "SUPERMERCADO BOM")
    add(card, date(2026, 10, 12), "100", "groceries", "ESTORNO SUPERMERCADO BOM")
    add(
        card,
        date(2026, 11, 10),
        "-200",
        "shopping",
        "LOJA X 2/3",
        status=TransactionStatus.PENDING,
    )
    db.commit()
    return cat


def test_summary_indices(db, data):
    s = analytics.summary(db, "2026-10", TODAY)

    assert s["income"] == Decimal("5000")
    # Fatura (transferência) fica de fora; estorno abate o mercado
    assert s["expense"] == Decimal("1455.90")
    assert s["savings_rate"] == pytest.approx(3544.10 / 5000)
    assert s["previous_expense"] == Decimal("855.90")
    # Fixo (Netflix 55,90) uma vez + variável (mercado 1400) extrapolado: 1400 / 15 * 31
    assert s["projected_expense"] == Decimal("2949.23")
    assert s["liquid_balance"] == Decimal("10000")
    assert s["card_debt"] == Decimal("500")
    assert s["emergency_reserve_months"] == pytest.approx(10000 / 855.90)
    assert s["fixed_monthly"] == Decimal("55.90")
    assert s["fixed_commitment"] == pytest.approx(55.90 / 5000)
    assert s["health"]["score"] == 100


def test_recurring_detects_subscription_but_not_variable_spending(db, data):
    found = analytics.recurring(db, TODAY)
    assert [r["name"][:7] for r in found] == ["NETFLIX"]
    assert found[0]["monthly_amount"] == Decimal("55.90")
    assert found[0]["annual_amount"] == Decimal("670.80")


def test_categories_flags_anomaly_against_previous_average(db, data):
    rows = {r["category_name"]: r for r in analytics.categories_breakdown(db, "2026-10")}
    groceries = rows["Supermercado"]
    assert groceries["spent"] == Decimal("1400")
    assert groceries["average"] == Decimal("800.00")
    assert groceries["anomaly"] is True
    assert groceries["change"] == pytest.approx(0.75)
    assert rows["Assinaturas e streaming"]["anomaly"] is False
    assert "Pagamento de fatura" not in rows


def test_cashflow_daily_merchants_commitments(db, data):
    flow = analytics.cashflow(db, "2026-10", months=4)
    assert [f["month"] for f in flow] == ["2026-07", "2026-08", "2026-09", "2026-10"]
    assert flow[0]["net"] == Decimal("5000") - Decimal("855.90")

    days = analytics.daily(db, "2026-10")
    assert len(days) == 31
    assert days[0]["current"] == Decimal("55.90")
    assert days[30]["current"] == Decimal("1455.90")
    assert days[29]["previous"] == Decimal("855.90")  # setembro tem 30 dias
    assert days[30]["previous"] is None

    top = analytics.top_merchants(db, "2026-10")
    assert top[0] == {"name": "SUPERMERCADO BOM", "total": Decimal("1500"), "count": 1}

    future = {c["month"]: c["amount"] for c in analytics.future_commitments(db, TODAY)}
    assert future["2026-11"] == Decimal("200")
    assert future["2026-10"] == Decimal("0")


def test_budget_carries_forward_and_can_be_removed(client, db, data, auth_headers):
    body = {"category_id": data["groceries"], "month": "2026-08", "limit_amount": "1000"}
    assert client.put("/budgets", json=body, headers=auth_headers).status_code == 204

    rows = client.get("/dashboard/categories", params={"month": "2026-10"}, headers=auth_headers)
    groceries = next(r for r in rows.json() if r["category_name"] == "Supermercado")
    assert float(groceries["budget"]) == 1000

    remove = {"category_id": data["groceries"], "month": "2026-10", "limit_amount": None}
    client.put("/budgets", json=remove, headers=auth_headers)
    rows = client.get("/dashboard/categories", params={"month": "2026-10"}, headers=auth_headers)
    groceries = next(r for r in rows.json() if r["category_name"] == "Supermercado")
    assert groceries["budget"] is None
    # Setembro continua com o orçamento definido em agosto
    sept = client.get("/dashboard/categories", params={"month": "2026-09"}, headers=auth_headers)
    assert float(next(r for r in sept.json() if r["category_name"] == "Supermercado")["budget"])


def test_budget_rejects_non_expense_category(client, data, auth_headers):
    body = {"category_id": data["salary"], "month": "2026-10", "limit_amount": "10"}
    assert client.put("/budgets", json=body, headers=auth_headers).status_code == 400


def test_dashboard_endpoints_respond(client, data, auth_headers):
    for path in (
        "summary",
        "cashflow",
        "categories",
        "daily",
        "merchants",
        "recurring",
        "commitments",
    ):
        resp = client.get(f"/dashboard/{path}", params={"month": "2026-10"}, headers=auth_headers)
        assert resp.status_code == 200, (path, resp.text)
