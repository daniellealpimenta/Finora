"""Migrações do banco rodando de dentro do app (programa instalado e importação de dados).

No modo web o caminho é o `alembic upgrade head` manual; aqui é o mesmo, sem o alembic.ini (o
fileConfig dele desligaria os loggers da aplicação).
"""

import logging
import shutil
import sqlite3
import sys
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy.engine import make_url

from app.db.session import engine

logger = logging.getLogger(__name__)

# No programa empacotado (PyInstaller), as migrações ficam ao lado do executável descompactado
_MIGRATIONS = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[2])) / "migrations"


def _config() -> Config:
    cfg = Config()
    cfg.set_main_option("script_location", str(_MIGRATIONS))
    return cfg


def database_path() -> Path | None:
    """Arquivo do SQLite em uso (None se o banco não for um arquivo SQLite)."""
    url = make_url(str(engine.url))
    return Path(url.database) if url.get_backend_name() == "sqlite" and url.database else None


def current_revision() -> str | None:
    with engine.connect() as conn:
        heads = MigrationContext.configure(conn).get_current_heads()
    return heads[0] if heads else None


def revision_of(path: Path) -> str | None:
    """Revisão do alembic gravada num arquivo de banco qualquer (de um backup, por exemplo)."""
    with sqlite3.connect(path) as conn:
        try:
            row = conn.execute("select version_num from alembic_version").fetchone()
        except sqlite3.DatabaseError:
            return None
    return row[0] if row else None


def is_known(revision: str) -> bool:
    """Esta versão do app conhece a revisão? Se não, o banco veio de um Finora mais novo."""
    script = ScriptDirectory.from_config(_config())
    return any(rev.revision == revision for rev in script.walk_revisions())


def upgrade(backup: bool = True) -> None:
    """Leva o banco até a última revisão. Antes de mexer, guarda uma cópia (`<banco>.bak`)."""
    cfg = _config()
    heads = set(ScriptDirectory.from_config(cfg).get_heads())
    with engine.connect() as conn:
        current = set(MigrationContext.configure(conn).get_current_heads())
    if current == heads:
        return
    database = database_path()
    if backup and current and database and database.is_file():
        shutil.copy2(database, f"{database}.bak")
        logger.info("Backup do banco em %s.bak", database)
    command.upgrade(cfg, "head")
