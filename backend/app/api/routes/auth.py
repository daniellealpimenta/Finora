from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.core.security import create_access_token, decrypt_field, verify_password, verify_totp
from app.db.models import User

router = APIRouter(prefix="/auth", tags=["auth"])

TOTP_REQUIRED = "TOTP_REQUIRED"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    totp_code: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MeResponse(BaseModel):
    id: int
    email: str


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: DbSession) -> TokenResponse:
    invalid = HTTPException(status.HTTP_401_UNAUTHORIZED, "E-mail, senha ou código inválidos")
    user = db.scalar(select(User).where(User.email == body.email.lower()))
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
def me(user: CurrentUser) -> MeResponse:
    return MeResponse(id=user.id, email=user.email)
