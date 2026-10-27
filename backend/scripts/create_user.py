"""Cria (ou redefine) o usuário único do sistema.

Uso (dentro de backend/):
  uv run python -m scripts.create_user voce@exemplo.com          # só senha
  uv run python -m scripts.create_user voce@exemplo.com --totp   # senha + 2FA (TOTP)
"""

import argparse
import getpass

from app.db.session import SessionLocal
from app.services.users import MIN_PASSWORD_LENGTH, save_user, totp_uri


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("email")
    parser.add_argument("--totp", action="store_true", help="ativar 2FA (app autenticador)")
    args = parser.parse_args()

    password = getpass.getpass("Senha: ")
    if len(password) < MIN_PASSWORD_LENGTH:
        raise SystemExit(f"Use uma senha com pelo menos {MIN_PASSWORD_LENGTH} caracteres.")
    if getpass.getpass("Confirme a senha: ") != password:
        raise SystemExit("As senhas não conferem.")

    with SessionLocal() as db:
        user, totp_secret = save_user(db, args.email, password, totp=args.totp)

    print(f"Usuário {user.email} salvo.")
    if totp_secret:
        uri = totp_uri(totp_secret, user.email)
        print("Adicione no seu app autenticador (cole a URI ou digite o segredo):")
        print(f"  segredo: {totp_secret}\n  uri:     {uri}")


if __name__ == "__main__":
    main()
