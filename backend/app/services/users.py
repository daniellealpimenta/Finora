"""Usuário único do sistema: criado pelo passo a passo do app ou por scripts.create_user."""

import pyotp
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import encrypt_field, hash_password
from app.db.models import User

MIN_PASSWORD_LENGTH = 12


class WeakPasswordError(ValueError):
    pass


def save_user(
    db: Session, email: str, password: str, *, totp: bool = False, username: str | None = None
) -> tuple[User, str | None]:
    """Cria ou redefine o usuário. Com `totp`, devolve o segredo novo do 2FA (em claro, para
    mostrar uma vez); no banco ele fica criptografado."""
    if len(password) < MIN_PASSWORD_LENGTH:
        raise WeakPasswordError(f"Use uma senha com pelo menos {MIN_PASSWORD_LENGTH} caracteres.")
    email = email.lower()
    totp_secret = pyotp.random_base32() if totp else None
    user = db.scalar(select(User).where(User.email == email)) or User(email=email)
    user.password_hash = hash_password(password)
    if username:
        user.username = username
    user.totp_secret = encrypt_field(totp_secret) if totp_secret else None
    db.add(user)
    db.commit()
    return user, totp_secret


def totp_uri(secret: str, email: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name="Finora")
