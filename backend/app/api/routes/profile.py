"""Perfil: e-mail, senha, 2FA e o estado das chaves do .env.

As chaves nunca saem daqui inteiras: só "configurada ou não" e os 4 últimos caracteres, para
reconhecer qual está em uso. Trocar e-mail, senha ou 2FA sempre pede a senha atual.
"""

from datetime import datetime
from pathlib import Path

import pyotp
import segno
from cryptography.fernet import Fernet
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DbSession
from app.core import usernames
from app.core.config import DATA_DIR, Settings, get_settings
from app.core.security import (
    decrypt_field,
    encrypt_field,
    hash_password,
    verify_password,
    verify_totp,
)
from app.db.models import Connection, User
from app.services import mascot

router = APIRouter(prefix="/profile", tags=["profile"])

MIN_PASSWORD = 12  # o mesmo de scripts.create_user
DEFAULT_JWT_SECRET = Settings.model_fields["jwt_secret"].default


class KeyOut(BaseModel):
    env: str
    label: str
    purpose: str
    configured: bool
    # Só o final ("…a1b2"), ou o valor inteiro quando não é segredo (endereço local)
    hint: str | None
    status: str  # ok | warn | bad
    note: str | None = None


class StorageOut(BaseModel):
    data_dir: str
    database: str | None
    database_bytes: int | None
    backups: int
    env_files: list[str]


class ProfileOut(BaseModel):
    email: str
    username: str | None
    created_at: datetime
    totp_enabled: bool
    session_minutes: int
    connections: int
    keys: list[KeyOut]
    storage: StorageOut


class EmailIn(BaseModel):
    email: EmailStr
    password: str


class UsernameIn(BaseModel):
    username: str | None  # vazio ou None tira o nome de usuário
    password: str


class PasswordIn(BaseModel):
    current: str
    new: str


class TotpSetupOut(BaseModel):
    secret: str
    uri: str
    qr_svg: str  # data URI


class TotpEnableIn(BaseModel):
    password: str
    secret: str
    code: str


class MascotIn(BaseModel):
    mascot: mascot.MascotId


class TotpDisableIn(BaseModel):
    password: str
    code: str


def _tail(value: str) -> str:
    return f"…{value[-4:]}" if len(value) > 8 else "…"


def _fernet_ok(key: str) -> bool:
    try:
        Fernet(key.encode())
    except ValueError:
        return False
    return True


def _keys(s: Settings) -> list[KeyOut]:
    jwt_default = s.jwt_secret == DEFAULT_JWT_SECRET
    jwt_short = len(s.jwt_secret) < 32
    fernet = bool(s.field_encryption_key)
    return [
        KeyOut(
            env="PLUGGY_CLIENT_ID",
            label="Pluggy: Client ID",
            purpose="Identifica o app na Pluggy, que traz os dados dos bancos.",
            configured=bool(s.pluggy_client_id),
            hint=_tail(s.pluggy_client_id) if s.pluggy_client_id else None,
            status="ok" if s.pluggy_client_id else "bad",
            note=None if s.pluggy_client_id else "Sem ela, as contas não sincronizam.",
        ),
        KeyOut(
            env="PLUGGY_CLIENT_SECRET",
            label="Pluggy: Client Secret",
            purpose="A senha do app na Pluggy. Com ela, alguém acessaria os dados dos bancos.",
            configured=bool(s.pluggy_client_secret),
            hint=_tail(s.pluggy_client_secret) if s.pluggy_client_secret else None,
            status="ok" if s.pluggy_client_secret else "bad",
            note=None if s.pluggy_client_secret else "Sem ela, as contas não sincronizam.",
        ),
        KeyOut(
            env="JWT_SECRET",
            label="Segredo das sessões",
            purpose="Assina o acesso depois do login. Quem tiver ele entra sem senha.",
            configured=not jwt_default,
            hint=None,
            status="bad" if jwt_default else "warn" if jwt_short else "ok",
            note="Ainda é o valor padrão: troque no .env."
            if jwt_default
            else "Curto: use 32 caracteres ou mais."
            if jwt_short
            else None,
        ),
        KeyOut(
            env="FIELD_ENCRYPTION_KEY",
            label="Chave de criptografia",
            purpose="Criptografa no banco o segredo do 2FA. Se trocar, o 2FA precisa ser refeito.",
            configured=fernet,
            hint=None,
            status="ok" if fernet and _fernet_ok(s.field_encryption_key) else "bad",
            note=None
            if fernet and _fernet_ok(s.field_encryption_key)
            else "Faltando ou inválida: o 2FA não funciona.",
        ),
        KeyOut(
            env="LLM_BASE_URL",
            label="Endereço do assistente",
            purpose="Onde o Ollama roda. Só aceita esta máquina: nada sai do computador.",
            configured=True,
            hint=s.llm_base_url,
            status="ok",
        ),
    ]


def _storage(s: Settings) -> StorageOut:
    db_path: Path | None = None
    if s.database_url.startswith("sqlite:///"):
        db_path = Path(s.database_url.removeprefix("sqlite:///"))
    folder = db_path.parent if db_path else DATA_DIR
    env_files = [
        str(p.resolve())
        for p in (Path(f) for f in Settings.model_config["env_file"])
        if p.is_file()
    ]
    return StorageOut(
        data_dir=str(DATA_DIR),
        database=str(db_path) if db_path else None,
        database_bytes=db_path.stat().st_size if db_path and db_path.is_file() else None,
        backups=len(list(folder.glob("*backup*.db"))) if folder.is_dir() else 0,
        env_files=env_files,
    )


def _check_password(user: User, password: str) -> None:
    # 400, não 401: a sessão continua válida, só a senha digitada está errada
    if not verify_password(password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Senha atual incorreta")


@router.get("", response_model=ProfileOut)
def get_profile(user: CurrentUser, db: DbSession) -> ProfileOut:
    s = get_settings()
    return ProfileOut(
        email=user.email,
        username=user.username,
        created_at=user.created_at,
        totp_enabled=bool(user.totp_secret),
        session_minutes=s.access_token_minutes,
        connections=db.scalar(select(func.count()).select_from(Connection)) or 0,
        keys=_keys(s),
        storage=_storage(s),
    )


@router.put("/email", status_code=status.HTTP_204_NO_CONTENT)
def change_email(body: EmailIn, user: CurrentUser, db: DbSession) -> None:
    _check_password(user, body.password)
    email = body.email.lower()
    taken = db.scalar(select(User).where(User.email == email, User.id != user.id))
    if taken:
        raise HTTPException(status.HTTP_409_CONFLICT, "Esse e-mail já está em uso")
    user.email = email
    db.commit()


@router.put("/username", status_code=status.HTTP_204_NO_CONTENT)
def change_username(body: UsernameIn, user: CurrentUser, db: DbSession) -> None:
    _check_password(user, body.password)
    username = usernames.normalize(body.username or "") or None
    if username is not None:
        if not usernames.is_valid(username):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, usernames.RULES)
        taken = db.scalar(select(User).where(User.username == username, User.id != user.id))
        if taken:
            raise HTTPException(status.HTTP_409_CONFLICT, "Esse nome de usuário já está em uso")
    user.username = username
    db.commit()


@router.put("/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(body: PasswordIn, user: CurrentUser, db: DbSession) -> None:
    _check_password(user, body.current)
    if len(body.new) < MIN_PASSWORD:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"Use pelo menos {MIN_PASSWORD} caracteres"
        )
    if body.new == body.current:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A nova senha é igual à atual")
    user.password_hash = hash_password(body.new)
    db.commit()


@router.put("/mascot", status_code=status.HTTP_204_NO_CONTENT)
def change_mascot(body: MascotIn, user: CurrentUser, db: DbSession) -> None:
    mascot.save_mascot(db, body.mascot)


@router.post("/totp/setup", response_model=TotpSetupOut)
def totp_setup(user: CurrentUser) -> TotpSetupOut:
    """Gera um segredo novo, ainda não salvo: só vale depois de confirmar um código."""
    secret = pyotp.random_base32()
    uri = pyotp.TOTP(secret).provisioning_uri(name=user.email, issuer_name="Finora")
    qr = segno.make(uri, error="m").svg_data_uri(scale=5, border=2)
    return TotpSetupOut(secret=secret, uri=uri, qr_svg=qr)


@router.post("/totp/enable", status_code=status.HTTP_204_NO_CONTENT)
def totp_enable(body: TotpEnableIn, user: CurrentUser, db: DbSession) -> None:
    _check_password(user, body.password)
    if not verify_totp(body.secret, body.code.strip()):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Código inválido. Confira o app.")
    user.totp_secret = encrypt_field(body.secret)
    db.commit()


@router.post("/totp/disable", status_code=status.HTTP_204_NO_CONTENT)
def totp_disable(body: TotpDisableIn, user: CurrentUser, db: DbSession) -> None:
    _check_password(user, body.password)
    if user.totp_secret and not verify_totp(decrypt_field(user.totp_secret), body.code.strip()):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Código inválido. Confira o app.")
    user.totp_secret = None
    db.commit()
