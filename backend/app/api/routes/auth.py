from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, model_validator
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, DbSession
from app.core import usernames
from app.core.security import create_access_token, decrypt_field, verify_password, verify_totp
from app.db.models import AppSetting, User
from app.services import mascot

router = APIRouter(prefix="/auth", tags=["auth"])

TOTP_REQUIRED = "TOTP_REQUIRED"
# O último e-mail ou usuário que entrou, para o login já vir preenchido. Fica no banco: a
# janela do programa abre em modo privado e esqueceria qualquer coisa do navegador.
LAST_LOGIN_KEY = "last_login"


class LoginRequest(BaseModel):
    # E-mail ou nome de usuário. `email` é o nome antigo do campo, ainda aceito.
    login: str | None = None
    email: str | None = None
    password: str
    totp_code: str | None = None

    @model_validator(mode="after")
    def _has_login(self) -> "LoginRequest":
        if not (self.login or self.email or "").strip():
            raise ValueError("Informe o e-mail ou o nome de usuário")
        return self


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LastLoginResponse(BaseModel):
    login: str | None


class MeResponse(BaseModel):
    id: int
    email: str
    username: str | None
    mascot: str


def remember_login(db: Session, login: str) -> None:
    setting = db.get(AppSetting, LAST_LOGIN_KEY)
    if setting is None:
        db.add(AppSetting(key=LAST_LOGIN_KEY, value={"login": login}))
    else:
        setting.value = {"login": login}
    db.commit()


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: DbSession) -> TokenResponse:
    invalid = HTTPException(status.HTTP_401_UNAUTHORIZED, "Login, senha ou código inválidos")
    login = usernames.normalize(body.login or body.email or "")
    # Nome de usuário nunca tem "@": dá para saber qual dos dois a pessoa digitou
    field = User.email if "@" in login else User.username
    user = db.scalar(select(User).where(field == login))
    if user is None or not verify_password(body.password, user.password_hash):
        raise invalid
    # 2FA é opcional por usuário (scripts.create_user --totp). O frontend só mostra o
    # campo do código quando recebe TOTP_REQUIRED.
    if user.totp_secret:
        if not body.totp_code:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, TOTP_REQUIRED)
        if not verify_totp(decrypt_field(user.totp_secret), body.totp_code):
            raise invalid
    remember_login(db, login)
    return TokenResponse(access_token=create_access_token(str(user.id)))


@router.get("/last-login", response_model=LastLoginResponse)
def last_login(db: DbSession) -> LastLoginResponse:
    """Sem login: a API só escuta nesta máquina, e é o mesmo que a tela já mostraria. Se o
    e-mail ou o usuário mudou desde então, não sugere o antigo."""
    setting = db.get(AppSetting, LAST_LOGIN_KEY)
    login = (setting.value or {}).get("login") if setting else None
    if login and not db.scalar(
        select(User.id).where(or_(User.email == login, User.username == login))
    ):
        login = None
    return LastLoginResponse(login=login)


@router.get("/me", response_model=MeResponse)
def me(user: CurrentUser, db: DbSession) -> MeResponse:
    return MeResponse(
        id=user.id, email=user.email, username=user.username, mascot=mascot.get_mascot(db)
    )
