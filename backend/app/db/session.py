import os
import re
from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


def _refuse_windows_path_elsewhere(database: str) -> None:
    """Fora do Windows, "C:/..." vira uma pasta relativa chamada "C:" (já aconteceu: o
    banco foi parar dentro do projeto, numa pasta sincronizada com o iCloud). Melhor não
    subir e dizer o porquê."""
    if os.name != "nt" and re.match(r"^[A-Za-z]:[\\/]", database):
        raise RuntimeError(
            f"DATABASE_URL aponta para um caminho do Windows ({database}) neste sistema. "
            "Remova a variável (unset DATABASE_URL) ou o DATABASE_URL do .env para usar a "
            "pasta padrão, ou informe um caminho deste computador."
        )


def _create_engine(url: str) -> Engine:
    parsed = make_url(url)
    if parsed.get_backend_name() != "sqlite":
        return create_engine(url, pool_pre_ping=True)

    if parsed.database and parsed.database != ":memory:":
        _refuse_windows_path_elsewhere(parsed.database)
        Path(parsed.database).parent.mkdir(parents=True, exist_ok=True)

    sqlite_engine = create_engine(url, connect_args={"check_same_thread": False})

    @event.listens_for(sqlite_engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _record) -> None:
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")  # o SQLite ignora FKs por padrão
        cursor.execute("PRAGMA journal_mode=WAL")  # leitura enquanto o sync escreve
        cursor.close()

    return sqlite_engine


engine = _create_engine(get_settings().database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
