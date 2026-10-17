from fastapi import APIRouter
from pydantic import BaseModel

from app.api.deps import CurrentUser
from app.integrations.pluggy.client import PluggyClient

router = APIRouter(prefix="/pluggy", tags=["pluggy"])


class ConnectTokenResponse(BaseModel):
    access_token: str


@router.post("/connect-token", response_model=ConnectTokenResponse)
def connect_token(_: CurrentUser, item_id: str | None = None) -> ConnectTokenResponse:
    """Token de curta duração para o widget Pluggy Connect (web/iOS).

    Rodando só local, não há webhook (a API não é exposta à internet):
    a atualização dos dados é feita por sync periódico (fase 2).
    """
    with PluggyClient() as pluggy:
        return ConnectTokenResponse(access_token=pluggy.create_connect_token(item_id))
