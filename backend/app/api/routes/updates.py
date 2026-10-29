"""Versão nova do programa: o aviso que aparece no topo do app (services/updates.py)."""

from fastapi import APIRouter, status
from pydantic import BaseModel

from app.api.deps import CurrentUser, DbSession
from app.services import updates

router = APIRouter(prefix="/updates", tags=["updates"])


class UpdateOut(BaseModel):
    current: str
    latest: str | None
    available: bool
    # O instalador deste sistema (.dmg ou Setup.exe) e a página com o que mudou
    download_url: str | None
    notes_url: str | None


class DismissIn(BaseModel):
    version: str


@router.get("", response_model=UpdateOut)
def check_update(_: CurrentUser, db: DbSession) -> UpdateOut:
    return UpdateOut(**updates.check(db))


@router.post("/dismiss", status_code=status.HTTP_204_NO_CONTENT)
def dismiss_update(body: DismissIn, _: CurrentUser, db: DbSession) -> None:
    """ "Agora não": some até sair uma versão mais nova que esta."""
    updates.dismiss(db, body.version)
