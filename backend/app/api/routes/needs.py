"""Jogo "Precisava ou foi vontade?": as cartas do ciclo, a jogada e o índice (services/needs.py)."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel

from app.api.deps import CurrentUser, DbSession
from app.api.numbers import plain
from app.db.models import Transaction
from app.services import analytics, needs

router = APIRouter(tags=["precisava ou vontade"])

Month = Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}$")]


class NeedIn(BaseModel):
    # True precisava, False foi vontade, None desfaz
    need: bool | None


def _month(db: DbSession, month: str | None) -> str:
    return month or analytics.current_cycle(db, date.today())["key"]


@router.get("/needs/deck")
def needs_deck(_: CurrentUser, db: DbSession, month: Month = None) -> list[dict]:
    return plain(needs.deck(db, _month(db, month)))


@router.get("/needs/summary")
def needs_summary(_: CurrentUser, db: DbSession, month: Month = None) -> dict:
    return plain(needs.summary(db, _month(db, month)))


@router.put("/transactions/{transaction_id}/need", status_code=status.HTTP_204_NO_CONTENT)
def set_need(transaction_id: int, body: NeedIn, _: CurrentUser, db: DbSession) -> None:
    tx = db.get(Transaction, transaction_id)
    if tx is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transação não encontrada")
    tx.need = body.need
    db.commit()
