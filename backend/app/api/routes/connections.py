import logging
from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.db.models import Account, AccountType, Connection
from app.db.session import SessionLocal
from app.integrations.pluggy.client import PluggyClient, PluggyError
from app.services.sync import SyncResult, get_pluggy_alert, run_sync, state

logger = logging.getLogger(__name__)

router = APIRouter(tags=["contas"])


class AccountOut(BaseModel):
    id: int
    connection_id: int | None
    name: str
    type: AccountType
    balance: Decimal
    credit_limit: Decimal | None
    currency: str
    bill_due_date: date | None
    bill_close_date: date | None
    # Cartão: dia de fechamento escolhido pelo usuário (null = estimado pelas faturas)
    closing_day: int | None

    model_config = {"from_attributes": True}


class AccountUpdate(BaseModel):
    closing_day: int | None = Field(default=None, ge=1, le=31)


class ConnectionOut(BaseModel):
    id: int
    institution_name: str
    institution_logo_url: str | None
    status: str
    last_synced_at: datetime | None
    last_sync_error: str | None
    accounts: list[AccountOut]

    model_config = {"from_attributes": True}


class ConnectionCreate(BaseModel):
    item_id: str


class SyncStatus(BaseModel):
    running: bool
    last_started_at: datetime | None
    last_finished_at: datetime | None
    last_error: str | None
    last_result: dict | None
    # A Pluggy recusou o acesso: {"since", "detail"} (ex.: fim do período de teste)
    pluggy_alert: dict | None = None


@router.get("/connections", response_model=list[ConnectionOut])
def list_connections(_: CurrentUser, db: DbSession) -> list[Connection]:
    return list(db.scalars(select(Connection).order_by(Connection.id)))


@router.post("/connections", response_model=ConnectionOut, status_code=status.HTTP_201_CREATED)
def create_connection(
    body: ConnectionCreate, _: CurrentUser, db: DbSession, background: BackgroundTasks
) -> Connection:
    """Registra um item criado pelo widget Pluggy Connect e dispara o primeiro sync."""
    connection = db.scalar(select(Connection).where(Connection.external_id == body.item_id))
    if connection is None:
        try:
            with PluggyClient() as pluggy:
                item = pluggy.get_item(body.item_id)
        except PluggyError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Item inválido: {exc}") from exc
        connector = item.get("connector") or {}
        connection = Connection(
            external_id=body.item_id,
            institution_name=connector.get("name") or "Instituição",
            institution_logo_url=connector.get("imageUrl"),
            status=item.get("status") or "UPDATING",
        )
        db.add(connection)
        db.commit()
        db.refresh(connection)
    background.add_task(run_sync, SessionLocal, [connection.id])
    return connection


@router.delete("/connections/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_connection(
    connection_id: int, _: CurrentUser, db: DbSession, remote: bool = True
) -> None:
    """Apaga a conexão e todos os dados locais dela.

    Com `remote=true` (padrão) também remove o item na Pluggy, encerrando o acesso.
    """
    connection = db.get(Connection, connection_id)
    if connection is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conexão não encontrada")
    if remote:
        try:
            with PluggyClient() as pluggy:
                pluggy.delete_item(connection.external_id)
        except PluggyError:
            logger.warning("Não foi possível remover o item na Pluggy", exc_info=True)
    db.delete(connection)
    db.commit()


@router.get("/accounts", response_model=list[AccountOut])
def list_accounts(_: CurrentUser, db: DbSession) -> list[Account]:
    return list(db.scalars(select(Account).order_by(Account.type, Account.name)))


@router.patch("/accounts/{account_id}", response_model=AccountOut)
def update_account(account_id: int, body: AccountUpdate, _: CurrentUser, db: DbSession) -> Account:
    """Dia de fechamento do cartão (null volta para o estimado). Muda os ciclos se for o
    cartão principal."""
    account = db.get(Account, account_id)
    if account is None or account.type != AccountType.CREDIT_CARD:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cartão não encontrado")
    account.closing_day = body.closing_day
    db.commit()
    return account


def _sync_status(db: DbSession) -> SyncStatus:
    result: SyncResult | None = state.last_result
    return SyncStatus(
        running=state.running,
        last_started_at=state.last_started_at,
        last_finished_at=state.last_finished_at,
        last_error=state.last_error,
        last_result=result.__dict__ if result else None,
        pluggy_alert=get_pluggy_alert(db),
    )


@router.post("/sync", response_model=SyncStatus, status_code=status.HTTP_202_ACCEPTED)
def sync_now(_: CurrentUser, db: DbSession, background: BackgroundTasks) -> SyncStatus:
    if not state.running:
        background.add_task(run_sync, SessionLocal)
    return _sync_status(db)


@router.get("/sync/status", response_model=SyncStatus)
def sync_status(_: CurrentUser, db: DbSession) -> SyncStatus:
    return _sync_status(db)
