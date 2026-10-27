"""Avisos por e-mail: conta de envio, preferências, teste, exemplos e histórico (Perfil).

A senha de app nunca volta pela API: só "configurada" e o endereço da conta.
"""

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.core.config import get_settings
from app.db.models import EmailLog
from app.services.notify import mailer, outbox
from app.services.notify.settings import (
    DETAILS,
    KIND_IDS,
    KINDS,
    Account,
    delete_account,
    get_account,
    get_config,
    save_account,
    save_config,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])

Detail = Literal["full", "totals", "discreet"]
assert set(DETAILS) == {"full", "totals", "discreet"}


class AccountOut(BaseModel):
    user: str
    host: str
    port: int
    source: Literal["profile", "env"]


class LogOut(BaseModel):
    kind: str
    subject: str | None
    status: str
    at: datetime


class NotificationsOut(BaseModel):
    account: AccountOut | None
    enabled: bool
    to: str | None
    default_to: str | None
    detail: Detail
    quiet: bool
    kinds: dict[str, bool]
    catalog: list[dict]
    last_error: dict | None
    log: list[LogOut]


class ConfigIn(BaseModel):
    enabled: bool | None = None
    to: EmailStr | None = None
    clear_to: bool = False  # volta para o e-mail da conta
    detail: Detail | None = None
    quiet: bool | None = None
    kinds: dict[str, bool] | None = None


class AccountIn(BaseModel):
    user: EmailStr
    # Vazio: mantém a senha já salva (para trocar só o servidor ou o endereço)
    password: str | None = Field(default=None, max_length=200)
    host: str = Field(default="smtp.gmail.com", max_length=200)
    port: int = Field(default=587, ge=1, le=65535)


def _out(db) -> NotificationsOut:
    config = get_config(db)
    account = get_account(db)
    log = db.scalars(
        select(EmailLog)
        .where(EmailLog.status != "baseline")
        .order_by(EmailLog.created_at.desc(), EmailLog.id.desc())
        .limit(15)
    )
    return NotificationsOut(
        account=AccountOut(
            user=account.user, host=account.host, port=account.port, source=account.source
        )
        if account
        else None,
        enabled=config["enabled"],
        to=config.get("to"),
        default_to=outbox.recipient(db, {**config, "to": None}),
        detail=config["detail"],
        quiet=config["quiet"],
        kinds={k: bool(config["kinds"].get(k, True)) for k in KIND_IDS},
        catalog=KINDS,
        last_error=config.get("last_error"),
        log=[LogOut(kind=e.kind, subject=e.subject, status=e.status, at=e.created_at) for e in log],
    )


@router.get("", response_model=NotificationsOut)
def get_notifications(user: CurrentUser, db: DbSession) -> NotificationsOut:
    return _out(db)


@router.put("/config", response_model=NotificationsOut)
def update_config(body: ConfigIn, user: CurrentUser, db: DbSession) -> NotificationsOut:
    changes: dict = {}
    for field in ("enabled", "detail", "quiet"):
        value = getattr(body, field)
        if value is not None:
            changes[field] = value
    if body.clear_to:
        changes["to"] = None
    elif body.to is not None:
        changes["to"] = str(body.to).lower()
    if body.kinds:
        unknown = set(body.kinds) - set(KIND_IDS)
        if unknown:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Aviso desconhecido: {unknown}")
        changes["kinds"] = body.kinds
    save_config(db, changes)
    return _out(db)


@router.put("/account", response_model=NotificationsOut)
def update_account(body: AccountIn, user: CurrentUser, db: DbSession) -> NotificationsOut:
    password = (body.password or "").replace(" ", "")
    if not password:
        current = get_account(db)
        if current is None or current.source != "profile":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Informe a senha de app")
        password = current.password
    account = Account(
        host=body.host.strip(),
        port=body.port,
        user=str(body.user).lower(),
        password=password,
        from_name="Finora",
        source="profile",
    )
    # Confere o login antes de salvar: erro de senha aparece agora, não no primeiro aviso
    try:
        mailer.check_login(account)
    except mailer.MailError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from None
    save_account(db, account)
    save_config(db, {"last_error": None})
    return _out(db)


@router.post("/account/import-env", response_model=NotificationsOut)
def import_env_account(user: CurrentUser, db: DbSession) -> NotificationsOut:
    """Copia a conta do .env (SMTP_*) para o Perfil: passa a valer também no programa."""
    s = get_settings()
    if not (s.smtp_user and s.smtp_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Não há conta de envio no .env")
    account = Account(
        host=s.smtp_host,
        port=s.smtp_port,
        user=s.smtp_user.lower(),
        password=s.smtp_password.replace(" ", ""),
        from_name="Finora",
        source="profile",
    )
    try:
        mailer.check_login(account)
    except mailer.MailError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from None
    save_account(db, account)
    return _out(db)


@router.delete("/account", response_model=NotificationsOut)
def remove_account(user: CurrentUser, db: DbSession) -> NotificationsOut:
    delete_account(db)
    return _out(db)


class TestOut(BaseModel):
    to: str


@router.post("/test", response_model=TestOut)
def send_test(user: CurrentUser, db: DbSession) -> TestOut:
    try:
        return TestOut(to=outbox.send_test(db))
    except mailer.MailError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from None


class PreviewOut(BaseModel):
    subject: str
    html: str


@router.get("/preview/{kind}", response_model=PreviewOut)
def preview(kind: str, user: CurrentUser, db: DbSession) -> PreviewOut:
    if kind not in KIND_IDS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aviso desconhecido")
    result = outbox.preview(db, kind)
    if result is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "Nada para mostrar agora: este aviso só aparece quando acontece.",
        )
    return PreviewOut(**result)
