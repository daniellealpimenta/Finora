"""Cria (ou redefine) o usuário único do sistema.

Uso (dentro de backend/):
  uv run python -m scripts.create_user voce@exemplo.com          # só senha
  uv run python -m scripts.create_user voce@exemplo.com --totp   # senha + 2FA (TOTP)
  uv run python -m scripts.create_user voce@exemplo.com --username voce  # login também por "voce"
"""

import argparse
import getpass

import pyotp
from sqlalchemy import select

from app.core import usernames
from app.core.security import encrypt_field, hash_password
from app.db.models import User
from app.db.session import SessionLocal


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("email")
    parser.add_argument("--totp", action="store_true", help="ativar 2FA (app autenticador)")
    parser.add_argument("--username", help="nome de usuário, para entrar sem digitar o e-mail")
    args = parser.parse_args()

    password = getpass.getpass("Senha: ")
    if len(password) < 12:
        raise SystemExit("Use uma senha com pelo menos 12 caracteres.")
    if getpass.getpass("Confirme a senha: ") != password:
        raise SystemExit("As senhas não conferem.")

    email = args.email.lower()
    username = usernames.normalize(args.username) if args.username else None
    if username and not usernames.is_valid(username):
        raise SystemExit(f"Nome de usuário inválido. {usernames.RULES}.")
    totp_secret = pyotp.random_base32() if args.totp else None

    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email)) or User(email=email)
        user.password_hash = hash_password(password)
        if username:
            user.username = username
        user.totp_secret = encrypt_field(totp_secret) if totp_secret else None
        db.add(user)
        db.commit()

    print(f"Usuário {email} salvo.")
    if totp_secret:
        uri = pyotp.TOTP(totp_secret).provisioning_uri(name=email, issuer_name="Finora")
        print("Adicione no seu app autenticador (cole a URI ou digite o segredo):")
        print(f"  segredo: {totp_secret}\n  uri:     {uri}")


if __name__ == "__main__":
    main()
