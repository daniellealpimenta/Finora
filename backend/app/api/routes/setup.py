"""Onboarding: a primeira abertura do programa, sem usuário no banco.

Substitui o `scripts.create_user` para quem baixou o .app/.exe: cria o usuário pela tela de
boas-vindas. Só funciona enquanto o banco não tem nenhum usuário; depois disso, criar ou
trocar qualquer coisa passa pelo login (e o Perfil pede a senha atual).
"""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, select

from app.api.deps import DbSession
from app.api.routes.auth import TokenResponse, remember_login
from app.core import usernames
from app.core.config import get_settings
from app.core.security import create_access_token, hash_password
from app.db.models import User

router = APIRouter(prefix="/setup", tags=["setup"])

MIN_PASSWORD = 12  # o mesmo de scripts.create_user e do Perfil


class SetupStatus(BaseModel):
    needs_user: bool
    pluggy_configured: bool


class SetupIn(BaseModel):
    email: EmailStr
    username: str | None = None
    password: str


def _has_user(db: DbSession) -> bool:
    return bool(db.scalar(select(func.count()).select_from(User)))


@router.get("", response_model=SetupStatus)
def setup_status(db: DbSession) -> SetupStatus:
    s = get_settings()
    return SetupStatus(
        needs_user=not _has_user(db),
        pluggy_configured=bool(s.pluggy_client_id and s.pluggy_client_secret),
    )


@router.post("", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def create_first_user(body: SetupIn, db: DbSession) -> TokenResponse:
    if _has_user(db):
        raise HTTPException(status.HTTP_409_CONFLICT, "O Finora já tem um usuário: faça login")
    if len(body.password) < MIN_PASSWORD:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"Use uma senha com pelo menos {MIN_PASSWORD} caracteres"
        )
    username = usernames.normalize(body.username or "") or None
    if username and not usernames.is_valid(username):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, usernames.RULES)

    user = User(
        email=body.email.lower(), username=username, password_hash=hash_password(body.password)
    )
    db.add(user)
    db.commit()
    remember_login(db, user.email)
    # Já entra: a próxima tela do onboarding (Pluggy) usa o Perfil, que pede login
    return TokenResponse(access_token=create_access_token(str(user.id)))
