"""Cria (ou redefine) o usuário único do sistema.

Uso (dentro de backend/):
  uv run python -m scripts.create_user voce@exemplo.com          # só senha
  uv run python -m scripts.create_user voce@exemplo.com --totp   # senha + 2FA (TOTP)
"""

import argparse
import getpass

import pyotp
from sqlalchemy import select

from app.core.security import encrypt_field, hash_password
from app.db.models import User
from app.db.session import SessionLocal


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("email")
    parser.add_argument("--totp", action="store_true", help="ativar 2FA (app autenticador)")
    args = parser.parse_args()

    password = getpass.getpass("Senha: ")
    if len(password) < 12:
        raise SystemExit("Use uma senha com pelo menos 12 caracteres.")
    if getpass.getpass("Confirme a senha: ") != password:
        raise SystemExit("As senhas não conferem.")

    email = args.email.lower()
    totp_secret = pyotp.random_base32() if args.totp else None

    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email)) or User(email=email)
        user.password_hash = hash_password(password)
        user.totp_secret = encrypt_field(totp_secret) if totp_secret else None
        db.add(user)
        db.commit()

    print(f"Usuário {email} salvo.")
    if totp_secret:
        uri = pyotp.TOTP(totp_secret).provisioning_uri(name=email, issuer_name="ManagerFinance")
        print("Adicione no seu app autenticador (cole a URI ou digite o segredo):")
        print(f"  segredo: {totp_secret}\n  uri:     {uri}")


if __name__ == "__main__":
    main()
