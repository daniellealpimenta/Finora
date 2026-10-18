from datetime import date

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.services import cards as card_service

router = APIRouter(tags=["cartões"])


@router.get("/cards")
def list_cards(_: CurrentUser, db: DbSession) -> list[dict]:
    """Cartões com limite usado e faturas (a aberta e as fechadas, mais recente primeiro)."""
    return card_service.cards(db, date.today())
