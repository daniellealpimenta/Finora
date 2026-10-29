"""O .env do programa: criado na primeira abertura e completado pelo onboarding.

No .app/.exe ninguém copia o .env do projeto: o programa cria um na pasta de dados, no
formato do .env.example, já com as duas chaves geradas (sessões e criptografia). As da Pluggy
ficam vazias até a pessoa preencher no onboarding ou no Perfil.
"""

import secrets
from pathlib import Path

from cryptography.fernet import Fernet

from app.core.config import _DATA_DIR, Settings, get_settings

DEFAULT_JWT_SECRET = Settings.model_fields["jwt_secret"].default

_TEMPLATE = """\
# Criado pelo Finora na primeira abertura. NUNCA compartilhe este arquivo.
ENVIRONMENT=production

# Gerados automaticamente. Trocar FIELD_ENCRYPTION_KEY desfaz o 2FA.
JWT_SECRET={jwt_secret}
FIELD_ENCRYPTION_KEY={field_encryption_key}

# https://dashboard.pluggy.ai -> Applications (o Finora preenche pelo onboarding ou Perfil)
PLUGGY_CLIENT_ID=
PLUGGY_CLIENT_SECRET=
"""


def target() -> Path:
    """O arquivo que vale: o último que existe na lista do Settings (o último vence). No
    programa é o da pasta de dados; no modo web, o do projeto."""
    existing = [Path(f) for f in Settings.model_config["env_file"] if Path(f).is_file()]
    return existing[-1] if existing else _DATA_DIR / ".env"


def ensure() -> None:
    """Cria o .env se não houver nenhum e gera as chaves que estiverem faltando. Nunca troca
    uma chave já preenchida (perderia o 2FA e as sessões)."""
    path = target()
    jwt_secret = secrets.token_urlsafe(48)
    fernet_key = Fernet.generate_key().decode()
    if not path.is_file():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            _TEMPLATE.format(jwt_secret=jwt_secret, field_encryption_key=fernet_key),
            encoding="utf-8",
        )
        path.chmod(0o600)
        get_settings.cache_clear()
        return

    s = get_settings()
    missing: dict[str, str] = {}
    if s.jwt_secret == DEFAULT_JWT_SECRET:
        missing["JWT_SECRET"] = jwt_secret
    if not s.field_encryption_key:
        missing["FIELD_ENCRYPTION_KEY"] = fernet_key
    if missing:
        update(missing)


def update(values: dict[str, str]) -> None:
    """Grava as chaves no .env mantendo o resto (comentários, ordem) e recarrega o Settings.
    Uma chave comentada ou ausente vai para o fim do arquivo."""
    path = target()
    lines = path.read_text(encoding="utf-8").splitlines() if path.is_file() else []
    pending = dict(values)
    for i, line in enumerate(lines):
        key = line.split("=", 1)[0].strip()
        if "=" in line and key in pending:
            lines[i] = f"{key}={pending.pop(key)}"
    lines += [f"{key}={value}" for key, value in pending.items()]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    path.chmod(0o600)
    get_settings.cache_clear()
