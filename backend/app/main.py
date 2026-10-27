import logging
import os
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from alembic.config import Config as AlembicConfig
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import __version__
from app.api.routes import (
    assistant,
    auth,
    cards,
    connections,
    dashboard,
    imports,
    pluggy,
    savings,
    setup,
    transactions,
    wishlist,
)
from app.core.config import get_settings
from app.db.session import SessionLocal, engine
from app.services.categories import recategorize_all
from app.workers.scheduler import start_scheduler

logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(name)s - %(message)s")

# No .exe (PyInstaller) alembic.ini, migrations/ e o frontend ficam na pasta do pacote
_BACKEND_DIR = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent))


def _frontend_dir() -> Path | None:
    """Frontend estático (next build com NEXT_OUTPUT=export). Só existe no .exe ou se
    FRONTEND_DIR for definido; no modo web o Next serve as páginas e isto fica de fora."""
    configured = os.environ.get("FRONTEND_DIR")
    path = Path(configured) if configured else _BACKEND_DIR / "frontend"
    return path if (path / "index.html").is_file() else None


def _require_migrated_db() -> None:
    """Código novo com banco antigo faz quase toda rota falhar com "no such column"
    (já aconteceu depois de um pull). Melhor não subir e dizer o que rodar."""
    script = ScriptDirectory.from_config(AlembicConfig(str(_BACKEND_DIR / "alembic.ini")))
    with engine.connect() as conn:
        current = MigrationContext.configure(conn).get_current_heads()
    if set(current) != set(script.get_heads()):
        raise RuntimeError(
            f"Banco desatualizado (revisão {', '.join(current) or 'nenhuma'}; código espera "
            f"{', '.join(script.get_heads())}). Rode em backend/: uv run alembic upgrade head"
        )


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    _require_migrated_db()
    with SessionLocal() as db:
        # Correções nas regras automáticas passam a valer também para o histórico
        changed = recategorize_all(db)
        if changed:
            logging.getLogger(__name__).info("%s transações recategorizadas", changed)
    scheduler = start_scheduler()
    yield
    if scheduler:
        scheduler.stop()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="ManagerFinance API",
        version=__version__,
        # Docs interativas só fora de produção
        docs_url=None if settings.environment == "production" else "/docs",
        redoc_url=None,
        openapi_url=None if settings.environment == "production" else "/openapi.json",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health", tags=["meta"])
    def health() -> dict[str, str]:
        return {"status": "ok", "version": __version__}

    app.include_router(setup.router)
    app.include_router(auth.router)
    app.include_router(pluggy.router)
    app.include_router(connections.router)
    app.include_router(transactions.router)
    app.include_router(imports.router)
    app.include_router(dashboard.router)
    app.include_router(savings.router)
    app.include_router(cards.router)
    app.include_router(wishlist.router)
    app.include_router(assistant.router)

    # Por último: as rotas da API têm prioridade sobre os arquivos do frontend
    frontend = _frontend_dir()
    if frontend:
        app.mount("/", StaticFiles(directory=frontend, html=True), name="frontend")
    return app


app = create_app()
