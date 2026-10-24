from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.db.models import (
    Account,
    AccountType,
    Category,
    Connection,
    Investment,
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
    # Fixo (Netflix 55,90) uma vez + variável (mercado 1400) + 16 dias no ritmo misto: o atual
    # (1400 / 15) pesa 15/31 e o dos 3 ciclos anteriores (2400 / 92 dias) o resto
    pace = Decimal(15) / 31 * Decimal(1400) / 15 + Decimal(16) / 31 * Decimal("26.09")
    assert s["projected_expense"] == (Decimal("1455.90") + pace * 16).quantize(Decimal("0.01"))
    assert s["liquid_balance"] == Decimal("10000")
    assert s["card_debt"] == Decimal("500")
    # A reserva desconta o que já é do cartão
    assert s["emergency_reserve_months"] == pytest.approx(9500 / 855.90)
    assert s["fixed_monthly"] == Decimal("55.90")
    assert s["fixed_commitment"] == pytest.approx(55.90 / 5000)
    assert s["health"]["score"] == 100
    # Score usa a poupança dos ciclos fechados (jul-set), não a do ciclo pela metade
    assert s["health"]["savings_rate"] == pytest.approx((15000 - 3 * 855.90) / 15000)


def test_projection_early_in_cycle_leans_on_history(db, data):
    # Dia 2 com o mercado de 1500 já lançado: extrapolar só o ritmo atual daria ~22 mil
    s = analytics.summary(db, "2026-10", date(2026, 10, 2))
    assert s["projected_expense"] < Decimal("3500")


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
        "installments",
    ):
        resp = client.get(f"/dashboard/{path}", params={"month": "2026-10"}, headers=auth_headers)
        assert resp.status_code == 200, (path, resp.text)

    # Dinheiro chega como número: o front soma e desenha gráficos com esses campos
    summary = client.get("/dashboard/summary", params={"month": "2026-10"}, headers=auth_headers)
    assert summary.json()["income"] == 5000 and isinstance(summary.json()["flow"]["result"], float)
    daily = client.get("/dashboard/daily", params={"month": "2026-10"}, headers=auth_headers)
    assert all(isinstance(d["current"], float) for d in daily.json())


def test_cash_view_and_cofrinhos_count_in_reserve(db, data):
    before = analytics.summary(db, "2026-10", TODAY)
    conn = Connection(external_id="item-x", institution_name="Banco", status="UPDATED")
    db.add(conn)
    db.flush()
    db.add(
        Investment(
            connection_id=conn.id,
            external_id="inv-1",
            name="Caixinha",
            type="FIXED_INCOME",
            balance=Decimal("2000"),
        )
    )
    card = db.scalar(select(Account).where(Account.type == AccountType.CREDIT_CARD))
    card.bill_due_date = date(2026, 10, 20)
    db.commit()

    s = analytics.summary(db, "2026-10", TODAY)

    assert s["invested"] == Decimal("2000")
    # Regime de caixa: 10.000 em conta menos os 500 devidos no cartão
    assert s["available_now"] == Decimal("9500")
    assert (s["next_bill_due"], s["next_bill_amount"]) == (date(2026, 10, 20), Decimal("500"))
    # A reserva passa a contar o livre em conta + cofrinhos
    assert s["emergency_reserve_months"] == pytest.approx(
        before["emergency_reserve_months"] * 11500 / 9500
    )


def test_installments_progress_for_both_dating_styles(db, data):
    card = db.scalar(select(Account).where(Account.type == AccountType.CREDIT_CARD))
    shopping = data["shopping"]

    def parcela(desc, d, amount, status=TransactionStatus.POSTED):
        number, total = (int(x) for x in desc.rsplit(" ", 1)[1].split("/"))
        db.add(
            Transaction(
                account_id=card.id,
                external_id=f"p-{desc}",
                source=TransactionSource.MANUAL,
                date=d,
                amount=Decimal(amount),
                description=desc,
                category_id=shopping,
                status=status,
                installment_number=number,
                installment_total=total,
            )
        )

    # Banco que data cada parcela no mês da fatura (a 3ª está na fatura aberta)
    parcela("NOTEBOOK 1/6", date(2026, 8, 8), "-506.70")
    parcela("NOTEBOOK 2/6", date(2026, 9, 10), "-506.66")
    parcela("NOTEBOOK 3/6", date(2026, 10, 9), "-506.66", TransactionStatus.PENDING)
    # Banco que manda todas as parcelas com a data da compra
    parcela("TENIS 1/3", date(2026, 8, 8), "-100")
    parcela("TENIS 2/3", date(2026, 8, 8), "-100")
    parcela("TENIS 3/3", date(2026, 8, 8), "-100", TransactionStatus.PENDING)
    # Já quitada: não aparece
    parcela("FONE 1/2", date(2026, 5, 3), "-80")
    parcela("FONE 2/2", date(2026, 6, 3), "-80")
    # Só a 2/3 aparece, na fatura aberta (a 1ª ficou fora da janela do sync)
    parcela("CADEIRA 2/3", date(2026, 10, 7), "-150", TransactionStatus.PENDING)
    db.commit()

    found = {i["name"]: i for i in analytics.installments(db)}

    assert "FONE" not in found
    notebook = found["NOTEBOOK"]
    assert (notebook["paid"], notebook["remaining"], notebook["total"]) == (2, 4, 6)
    assert notebook["remaining_amount"] == Decimal("2026.64")
    assert (notebook["first_month"], notebook["last_month"]) == ("2026-08", "2027-01")
    tenis = found["TENIS"]
    assert (tenis["paid"], tenis["remaining"], tenis["last_month"]) == (2, 1, "2026-10")
    cadeira = found["CADEIRA"]
    assert (cadeira["paid"], cadeira["remaining"], cadeira["first_month"]) == (1, 2, "2026-09")
    assert list(found) == ["NOTEBOOK", "CADEIRA", "TENIS"]  # maior valor que falta primeiro

    # Parcelas entram no comprometimento junto com as contas fixas
    s = analytics.summary(db, "2026-10", TODAY)
    assert s["installments_monthly"] == Decimal("756.66")
    assert s["fixed_commitment"] == pytest.approx((55.90 + 756.66) / 5000)


def test_notes_flag_payment_that_fell_in_the_next_cycle(db, data):
    checking = db.scalar(select(Account).where(Account.type == AccountType.CHECKING))
    # Boleto de todo ciclo: em julho, nenhum em agosto, dois em setembro (um é o de agosto)
    for i, d in enumerate((date(2026, 7, 6), date(2026, 9, 1), date(2026, 9, 30))):
        db.add(
            Transaction(
                account_id=checking.id,
                external_id=f"boleto{i}",
                source=TransactionSource.MANUAL,
                date=d,
                amount=Decimal("-887.18"),
                description="ESCOLA BOA",
                category_id=data["education"],
            )
        )
    db.commit()

    aug = analytics.summary(db, "2026-08", TODAY)["notes"]
    assert [(n["kind"], n["label"], n["amount"], n["dates"]) for n in aug] == [
        ("shifted_out", "ESCOLA BOA", Decimal("887.18"), [date(2026, 9, 1)])
    ]
    sep = analytics.summary(db, "2026-09", TODAY)["notes"]
    assert [(n["kind"], n["dates"]) for n in sep] == [
        ("doubled", [date(2026, 9, 1), date(2026, 9, 30)])
    ]
    # Sem desvio: salário e mercado caem uma vez por ciclo
    assert analytics.summary(db, "2026-07", TODAY)["notes"] == []
