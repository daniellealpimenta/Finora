import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from alembic.config import Config as AlembicConfig
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    assistant,
    auth,
    cards,
    connections,
    dashboard,
    imports,
    pluggy,
    savings,
    transactions,
    wishlist,
)
from app.core.config import get_settings
from app.db.session import SessionLocal, engine
from app.services.categories import recategorize_all
from app.workers.scheduler import start_scheduler

logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(name)s - %(message)s")

_BACKEND_DIR = Path(__file__).resolve().parent.parent


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
        version="0.2.0",
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
        return {"status": "ok"}

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
    return app


app = create_app()
