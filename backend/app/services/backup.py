"""Levar os dados para outro computador: o arquivo `.finora`.

O Finora não tem nuvem. Para usar em mais de um computador (Mac e Windows), a pessoa exporta um
arquivo num e importa no outro. O arquivo tem:

- uma linha de cabeçalho em texto (`FINORA-BACKUP`), com o que dá para mostrar antes de pedir a
  senha: data, computador de origem, versão do app e revisão do banco. Nada financeiro;
- o resto, criptografado com a senha escolhida na exportação (Scrypt → chave Fernet): um zip com
  o banco inteiro (cópia consistente pela API de backup do SQLite) e as chaves do `.env` que os
  dados precisam: a do 2FA (FIELD_ENCRYPTION_KEY), as da Pluggy e as do e-mail. A JWT_SECRET é de
  cada computador e não viaja.

Importar substitui os dados deste computador. Antes, uma cópia do banco atual fica na pasta de
dados (`managerfinance-antes-da-importacao-<data>.db`). Banco de um Finora mais novo é recusado
(peça para atualizar); de um mais velho, é migrado na hora.
"""

import base64
import io
import json
import logging
import platform
import secrets
import sqlite3
import tempfile
import zipfile
from contextlib import closing
from datetime import datetime
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

from app.core import envfile
from app.core.config import get_settings
from app.db import migrate
from app.db.session import engine
from app.services import sync
from app.services.updates import current_version

logger = logging.getLogger(__name__)

MAGIC = b"FINORA-BACKUP"
FORMAT = 1
MIN_PASSWORD = 8
DB_NAME = "managerfinance.db"
# Chaves do .env que os dados precisam no outro computador (o resto é de cada máquina)
CARRIED_KEYS = (
    "FIELD_ENCRYPTION_KEY",
    "PLUGGY_CLIENT_ID",
    "PLUGGY_CLIENT_SECRET",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASSWORD",
)


class BackupError(Exception):
    """Arquivo inválido, senha errada ou incompatível (a mensagem vai para o usuário)."""


def _key(password: str, salt: bytes) -> bytes:
    # Scrypt deixa cada tentativa de senha cara para quem pegar o arquivo
    raw = Scrypt(salt=salt, length=32, n=2**15, r=8, p=1).derive(password.encode())
    return base64.urlsafe_b64encode(raw)


def _copy_db(source: Path, dest: Path) -> None:
    """Copia um banco SQLite pela API de backup e fecha as conexões.

    `with sqlite3.connect()` só faz commit, não fecha: no Windows o arquivo continua preso e a
    pasta temporária não consegue apagá-lo (WinError 32).
    """
    with closing(sqlite3.connect(source)) as src, closing(sqlite3.connect(dest)) as dst:
        src.backup(dst)


def _snapshot(dest: Path) -> None:
    """Cópia consistente do banco em uso, mesmo com o app aberto (API de backup do SQLite)."""
    source = migrate.database_path()
    if source is None or not source.is_file():
        raise BackupError("O banco deste computador não é um arquivo SQLite")
    _copy_db(source, dest)


def _carried_env() -> dict[str, str]:
    s = get_settings()
    values = {
        "FIELD_ENCRYPTION_KEY": s.field_encryption_key,
        "PLUGGY_CLIENT_ID": s.pluggy_client_id,
        "PLUGGY_CLIENT_SECRET": s.pluggy_client_secret,
        "SMTP_HOST": s.smtp_host,
        "SMTP_PORT": str(s.smtp_port),
        "SMTP_USER": s.smtp_user,
        "SMTP_PASSWORD": s.smtp_password,
    }
    return {k: v for k, v in values.items() if k in CARRIED_KEYS and v}


def export(password: str, owner: str | None) -> tuple[bytes, dict]:
    """O arquivo `.finora` inteiro e o cabeçalho dele."""
    if len(password) < MIN_PASSWORD:
        raise BackupError(f"Use uma senha com pelo menos {MIN_PASSWORD} caracteres")
    with tempfile.TemporaryDirectory() as tmp:
        db_copy = Path(tmp) / DB_NAME
        _snapshot(db_copy)
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.write(db_copy, DB_NAME)
            archive.writestr("env.json", json.dumps(_carried_env()))
        payload = buffer.getvalue()

    salt = secrets.token_bytes(16)
    header = {
        "format": FORMAT,
        "created_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "device": platform.node().removesuffix(".local") or "computador",
        "system": {"Darwin": "Mac", "Windows": "Windows"}.get(platform.system(), platform.system()),
        "app_version": current_version(),
        "revision": migrate.current_revision(),
        "owner": owner,
        "salt": base64.b64encode(salt).decode(),
    }
    token = Fernet(_key(password, salt)).encrypt(payload)
    return MAGIC + b" " + json.dumps(header).encode() + b"\n" + token, header


def read_header(data: bytes) -> dict:
    """O cabeçalho em texto (sem senha): para mostrar de onde e de quando é o arquivo."""
    first, sep, _ = data.partition(b"\n")
    if not sep or not first.startswith(MAGIC + b" "):
        raise BackupError("Este arquivo não é um backup do Finora (.finora)")
    try:
        header = json.loads(first[len(MAGIC) + 1 :])
    except ValueError:
        raise BackupError("O arquivo está danificado") from None
    if header.get("format") != FORMAT:
        raise BackupError("Este backup é de um formato que esta versão do Finora não conhece")
    revision = header.get("revision")
    header["compatible"] = bool(revision) and migrate.is_known(revision)
    return header


def restore(data: bytes, password: str) -> dict:
    """Substitui os dados deste computador pelos do arquivo. Devolve o cabeçalho."""
    header = read_header(data)
    if not header["compatible"]:
        raise BackupError(
            f"Este backup veio do Finora {header.get('app_version')}, mais novo que este. "
            "Atualize o Finora neste computador e tente de novo."
        )
    try:
        salt = base64.b64decode(header["salt"])
        payload = Fernet(_key(password, salt)).decrypt(data.partition(b"\n")[2])
    except (InvalidToken, KeyError, ValueError):
        raise BackupError("Senha errada (ou o arquivo foi alterado)") from None

    target = migrate.database_path()
    if target is None:
        raise BackupError("O banco deste computador não é um arquivo SQLite")
    with tempfile.TemporaryDirectory() as tmp:
        try:
            with zipfile.ZipFile(io.BytesIO(payload)) as archive:
                archive.extract(DB_NAME, tmp)
                env = json.loads(archive.read("env.json"))
        except (zipfile.BadZipFile, KeyError, ValueError):
            raise BackupError("O arquivo está danificado") from None
        incoming = Path(tmp) / DB_NAME
        if migrate.revision_of(incoming) is None:
            raise BackupError("O arquivo não tem um banco do Finora válido")

        stamp = datetime.now().strftime("%Y-%m-%d-%H%M%S")
        keep = target.with_name(f"managerfinance-antes-da-importacao-{stamp}.db")
        try:
            # Nada de sync gravando no meio da troca
            with sync.exclusive():
                if target.is_file():
                    _copy_db(target, keep)
                    logger.info("Banco anterior guardado em %s", keep)
                engine.dispose()
                _copy_db(incoming, target)
                engine.dispose()
                migrate.upgrade(backup=False)
                values = {k: str(v) for k, v in env.items() if k in CARRIED_KEYS and v}
                if values:
                    envfile.update(values)
        except TimeoutError as e:
            raise BackupError(str(e)) from None
    header["kept_as"] = keep.name if keep.is_file() else None
    return header
