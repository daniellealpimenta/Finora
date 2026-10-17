from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.db.models import Budget, Category, CategoryKind
from app.services import analytics
from app.services.periods import month_bounds, month_key

router = APIRouter(tags=["dashboard"])

Month = Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}$")]


def _month(month: str | None) -> str:
    return month or month_key(date.today())


@router.get("/dashboard/summary")
def summary(_: CurrentUser, db: DbSession, month: Month = None) -> dict:
    """KPIs do mês: receitas, despesas, poupança, reserva, comprometimento, score."""
    return analytics.summary(db, _month(month), date.today())


@router.get("/dashboard/cashflow")
def cashflow(
    _: CurrentUser,
    db: DbSession,
    month: Month = None,
    months: Annotated[int, Query(ge=1, le=36)] = 12,
) -> list[dict]:
    return analytics.cashflow(db, _month(month), months)


@router.get("/dashboard/categories")
def categories(_: CurrentUser, db: DbSession, month: Month = None) -> list[dict]:
    return analytics.categories_breakdown(db, _month(month))


@router.get("/dashboard/daily")
def daily(_: CurrentUser, db: DbSession, month: Month = None) -> list[dict]:
    return analytics.daily(db, _month(month))


@router.get("/dashboard/merchants")
def merchants(_: CurrentUser, db: DbSession, month: Month = None) -> list[dict]:
    return analytics.top_merchants(db, _month(month))


@router.get("/dashboard/recurring")
def recurring(_: CurrentUser, db: DbSession) -> list[dict]:
    return analytics.recurring(db, date.today())


@router.get("/dashboard/commitments")
def commitments(_: CurrentUser, db: DbSession) -> list[dict]:
    """Parcelas e lançamentos futuros já contratados, por mês."""
    return analytics.future_commitments(db, date.today())


# --- orçamentos ---------------------------------------------------------------------


class BudgetIn(BaseModel):
    category_id: int
    month: str = Field(pattern=r"^\d{4}-\d{2}$")
    # None ou 0 = remover o orçamento a partir deste mês
    limit_amount: Decimal | None = Field(default=None, ge=0)


@router.put("/budgets", status_code=status.HTTP_204_NO_CONTENT)
def set_budget(body: BudgetIn, _: CurrentUser, db: DbSession) -> None:
    """Define o limite de uma categoria a partir do mês informado (vale para os seguintes)."""
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
