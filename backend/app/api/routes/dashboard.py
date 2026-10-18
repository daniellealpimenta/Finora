from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.db.models import Budget, Category, CategoryKind
from app.services import analytics, forecast
from app.services.periods import month_bounds

router = APIRouter(tags=["dashboard"])

Month = Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}$")]


def _month(db: DbSession, month: str | None) -> str:
    """Chave do ciclo pedido ("2026-09" = ciclo que começa em setembro); padrão: o atual."""
    return month or analytics.current_cycle(db, date.today())["key"]


@router.get("/dashboard/cycle")
def cycle(_: CurrentUser, db: DbSession, month: Month = None) -> dict:
    """Início e fim do ciclo (o atual, sem `month`) e o cartão que define os ciclos."""
    return analytics.current_cycle(db, date.today(), month)


@router.get("/dashboard/forecast")
def cycle_forecast(_: CurrentUser, db: DbSession) -> dict:
    """Previsão do fim do ciclo atual: livre agora + entradas previstas − saídas previstas."""
    return forecast.forecast(db, date.today())


class IncomeRule(BaseModel):
    # Último ciclo em que a entrada conta ("2027-02"); null = sem fim
    until: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}$")
    ignore: bool = False


class PlanningIn(BaseModel):
    tithe_rate: float = Field(default=0, ge=0, le=1)
    savings_goal: Decimal = Field(default=Decimal("0"), ge=0)
    incomes: dict[str, IncomeRule] = Field(default_factory=dict)


@router.get("/planning")
def get_planning(_: CurrentUser, db: DbSession) -> dict:
    """Preferências da previsão: dízimo, meta do cofrinho e regras das entradas fixas."""
    return forecast.get_planning(db)


@router.put("/planning")
def put_planning(body: PlanningIn, _: CurrentUser, db: DbSession) -> dict:
    value = body.model_dump(mode="json")
    value["savings_goal"] = float(body.savings_goal)
    return forecast.save_planning(db, value)


@router.get("/dashboard/summary")
def summary(_: CurrentUser, db: DbSession, month: Month = None) -> dict:
    """KPIs do ciclo: a conta do ciclo, receitas, despesas, reserva, score."""
    return analytics.summary(db, _month(db, month), date.today())


@router.get("/dashboard/cashflow")
def cashflow(
    _: CurrentUser,
    db: DbSession,
    month: Month = None,
    months: Annotated[int, Query(ge=1, le=36)] = 12,
) -> list[dict]:
    return analytics.cashflow(db, _month(db, month), months)


@router.get("/dashboard/categories")
def categories(_: CurrentUser, db: DbSession, month: Month = None) -> list[dict]:
    return analytics.categories_breakdown(db, _month(db, month))


@router.get("/dashboard/daily")
def daily(_: CurrentUser, db: DbSession, month: Month = None) -> list[dict]:
    return analytics.daily(db, _month(db, month))


@router.get("/dashboard/merchants")
def merchants(_: CurrentUser, db: DbSession, month: Month = None) -> list[dict]:
    return analytics.top_merchants(db, _month(db, month))


@router.get("/dashboard/recurring")
def recurring(_: CurrentUser, db: DbSession) -> list[dict]:
    return analytics.recurring(db, date.today())


@router.get("/dashboard/commitments")
def commitments(_: CurrentUser, db: DbSession) -> list[dict]:
    """Parcelas e lançamentos futuros já contratados, por ciclo."""
    return analytics.future_commitments(db, date.today())


@router.get("/dashboard/installments")
def installments(_: CurrentUser, db: DbSession) -> list[dict]:
    """Compras parceladas em andamento: pagas, faltam, valor que falta."""
    return analytics.installments(db)


# --- orçamentos ---------------------------------------------------------------------


class BudgetIn(BaseModel):
    category_id: int
    month: str = Field(pattern=r"^\d{4}-\d{2}$")
    # None ou 0 = remover o orçamento a partir deste mês
    limit_amount: Decimal | None = Field(default=None, ge=0)


@router.put("/budgets", status_code=status.HTTP_204_NO_CONTENT)
def set_budget(body: BudgetIn, _: CurrentUser, db: DbSession) -> None:
    """Define o limite de uma categoria a partir do ciclo informado (vale para os seguintes)."""
    category = db.get(Category, body.category_id)
    if category is None or category.kind != CategoryKind.EXPENSE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Escolha uma categoria de despesa")
    start, _ = month_bounds(body.month)
    budget = db.scalar(
        select(Budget).where(Budget.category_id == category.id, Budget.month == start)
    )
    if budget is None:
        budget = Budget(category_id=category.id, month=start)
        db.add(budget)
    budget.limit_amount = body.limit_amount or Decimal("0")
    db.commit()
