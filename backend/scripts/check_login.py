"""Diagnostica o login: verifica senha e código 2FA separadamente.

A senha é um hash Argon2 (não é reversível): só dá para verificar se a digitada confere.
O segredo do 2FA é descriptografado com FIELD_ENCRYPTION_KEY para calcular o código esperado.

Uso (dentro de backend/):
  uv run python -m scripts.check_login voce@exemplo.com
"""

import argparse
import getpass

import pyotp
from sqlalchemy import select

from app.core.security import decrypt_field, verify_password
from app.db.models import User
from app.db.session import SessionLocal


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("email")
    args = parser.parse_args()

    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == args.email.lower()))
    if user is None:
        raise SystemExit(f"[X] Nenhum usuário com o e-mail {args.email.lower()!r}")
    print(f"[OK] Usuário encontrado: {user.email}")

    password = getpass.getpass("Senha (não aparece enquanto digita): ")
    if verify_password(password, user.password_hash):
        print("[OK] Senha confere")
    else:
        print("[X] Senha NÃO confere. Redefina com: uv run python -m scripts.create_user <email>")

    if not user.totp_secret:
        print("[--] 2FA desativado para este usuário (deixe o campo do código vazio)")
        return

    totp = pyotp.TOTP(decrypt_field(user.totp_secret))
    print(f"\nCódigo esperado AGORA: {totp.now()}")
    print("Compare com o código que o app autenticador mostra neste momento.")
    code = input("Ou digite o código do app para testar: ").strip()
    if totp.verify(code, valid_window=1):
        print("[OK] Código 2FA confere")
    else:
        print(
            "[X] Código NÃO confere: o segredo cadastrado no app é diferente do salvo no banco.\n"
            "    Apague a conta 'Finora' (ou 'ManagerFinance', se for antiga) do app autenticador"
            " e rode create_user de novo."
        )


if __name__ == "__main__":
    main()
