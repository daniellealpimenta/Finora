from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, model_validator
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.core import usernames
from app.core.security import create_access_token, decrypt_field, verify_password, verify_totp
from app.db.models import User
from app.services import mascot

router = APIRouter(prefix="/auth", tags=["auth"])

TOTP_REQUIRED = "TOTP_REQUIRED"


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


class MeResponse(BaseModel):
    id: int
    email: str
    username: str | None
    mascot: str


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
    return TokenResponse(access_token=create_access_token(str(user.id)))


@router.get("/me", response_model=MeResponse)
def me(user: CurrentUser, db: DbSession) -> MeResponse:
    return MeResponse(
        id=user.id, email=user.email, username=user.username, mascot=mascot.get_mascot(db)
    )
