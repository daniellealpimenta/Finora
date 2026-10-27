"""Primeira configuração, guiada pelo app (tela /bem-vindo): cria o usuário, salva as chaves
da Pluggy e lembra em que passo a pessoa parou.

A única rota pública que escreve é `POST /setup/user`, e ela só funciona enquanto não existir
usuário. A API escuta só em 127.0.0.1.
"""

import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.core.config import get_settings, save_local_settings
from app.core.security import create_access_token
from app.db.models import AppSetting, Connection, User
from app.integrations.pluggy.client import PluggyClient, PluggyCredentialsError, PluggyError
from app.services.sync import clear_pluggy_alert, get_pluggy_alert
from app.services.users import WeakPasswordError, save_user, totp_uri

router = APIRouter(prefix="/setup", tags=["setup"])

SETTING_KEY = "onboarding"


def _has_user(db: DbSession) -> bool:
    return db.scalar(select(User.id).limit(1)) is not None


class SetupStatus(BaseModel):
    has_user: bool
    pluggy_configured: bool
    has_connection: bool
    step: str | None
    done: bool
    # Desde quando a Pluggy recusa o acesso (o detalhe fica em /sync/status, que pede login)
    pluggy_alert_since: str | None = None


class UserIn(BaseModel):
    email: EmailStr
    password: str
    totp: bool = False


class UserOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    totp_secret: str | None = None
    totp_uri: str | None = None


class PluggyIn(BaseModel):
    client_id: str = Field(min_length=1)
    client_secret: str = Field(min_length=1)


class ProgressIn(BaseModel):
    step: str = Field(max_length=32)
    done: bool = False


@router.get("/status", response_model=SetupStatus)
def setup_status(db: DbSession) -> SetupStatus:
    settings = get_settings()
    has_connection = db.scalar(select(Connection.id).limit(1)) is not None
    progress = db.get(AppSetting, SETTING_KEY)
    value = progress.value if progress else {}
    return SetupStatus(
        has_user=_has_user(db),
        pluggy_configured=bool(settings.pluggy_client_id and settings.pluggy_client_secret),
        has_connection=has_connection,
        step=value.get("step"),
        # Quem já usava o app antes do passo a passo não precisa passar por ele
        done=value.get("done", progress is None and has_connection),
        pluggy_alert_since=(get_pluggy_alert(db) or {}).get("since"),
    )


@router.post("/user", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_first_user(body: UserIn, db: DbSession) -> UserOut:
    if _has_user(db):
        raise HTTPException(status.HTTP_409_CONFLICT, "O usuário já foi criado; entre com a senha")
    try:
        user, secret = save_user(db, body.email, body.password, totp=body.totp)
    except WeakPasswordError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from None
    return UserOut(
        access_token=create_access_token(str(user.id)),
        totp_secret=secret,
        totp_uri=totp_uri(secret, user.email) if secret else None,
    )


@router.put("/pluggy", status_code=status.HTTP_204_NO_CONTENT)
def set_pluggy_keys(body: PluggyIn, _: CurrentUser, db: DbSession) -> None:
    """Testa as chaves na Pluggy antes de salvar; vale também para trocá-las depois."""
    client_id, client_secret = body.client_id.strip(), body.client_secret.strip()
    try:
        with PluggyClient(client_id, client_secret) as pluggy:
            pluggy.check_credentials()
    except PluggyCredentialsError:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "A Pluggy não aceitou essas chaves. Confira se copiou o Client ID e o Client Secret "
            "inteiros, sem espaços.",
        ) from None
    except (PluggyError, httpx.HTTPError):
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Não consegui falar com a Pluggy. Confira a internet e tente de novo.",
        ) from None
    save_local_settings({"PLUGGY_CLIENT_ID": client_id, "PLUGGY_CLIENT_SECRET": client_secret})
    # Chave nova e aceita: o aviso de acesso recusado não vale mais
    clear_pluggy_alert(db)


@router.put("/progress", status_code=status.HTTP_204_NO_CONTENT)
def set_progress(body: ProgressIn, _: CurrentUser, db: DbSession) -> None:
    setting = db.get(AppSetting, SETTING_KEY)
    value = {"step": body.step, "done": body.done}
    if setting is None:
        db.add(AppSetting(key=SETTING_KEY, value=value))
    else:
        setting.value = value
    db.commit()
