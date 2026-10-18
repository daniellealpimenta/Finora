import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    auth,
    cards,
    connections,
    dashboard,
    imports,
    pluggy,
    savings,
    transactions,
)
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.services.categories import recategorize_all
from app.workers.scheduler import start_scheduler

logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(name)s - %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
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
    return app


app = create_app()
