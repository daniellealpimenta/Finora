"""Sync periódico em uma thread de fundo, dentro do próprio processo da API.

Roda só local: sem webhook (a Pluggy não alcança a sua máquina), então buscamos
os dados a cada SYNC_INTERVAL_HOURS. Ao subir a API, sincroniza se o último
sync estiver mais velho que o intervalo. No mesmo laço, rechecamos o preço dos desejos.
"""

import logging
import threading
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select

from app.core.config import get_settings
from app.db.models import Connection
from app.db.session import SessionLocal
from app.services.notify import outbox as notify_outbox
from app.services.sync import run_sync
from app.services.wishlist import refresh_prices

logger = logging.getLogger(__name__)


class SyncScheduler:
    def __init__(self, interval_hours: float) -> None:
        self.interval = timedelta(hours=interval_hours)
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._loop, name="sync-scheduler", daemon=True)

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _is_stale(self) -> bool:
        with SessionLocal() as db:
            last = db.scalar(select(func.min(Connection.last_synced_at)))
            has_connections = db.scalar(select(func.count(Connection.id))) > 0
        if not has_connections:
            return False
        if last is None:
            return True
        if last.tzinfo is None:  # SQLite devolve datetime sem fuso
            last = last.replace(tzinfo=UTC)
        return datetime.now(UTC) - last >= self.interval

    def _loop(self) -> None:
        # Pequena espera para a API terminar de subir
        if self._stop.wait(5):
            return
        while not self._stop.is_set():
            try:
                if self._is_stale():
                    logger.info("Sync agendado iniciando")
                    run_sync(SessionLocal)
            except Exception:
                logger.exception("Erro no agendador de sync")
            try:
                # Preço dos desejos com link: cada um é rechecado uma vez por dia
                with SessionLocal() as db:
                    refresh_prices(db)
            except Exception:
                logger.exception("Erro ao atualizar preços da lista de desejos")
            try:
                # Avisos por e-mail: depois do sync, para já pegar as novidades dele
                with SessionLocal() as db:
                    notify_outbox.run(db)
            except Exception:
                logger.exception("Erro nos avisos por e-mail")
            # Reavalia a cada 15 min; só sincroniza quando o intervalo venceu
            self._stop.wait(15 * 60)


def start_scheduler() -> SyncScheduler | None:
    settings = get_settings()
    if not settings.scheduler_enabled:
        return None
    scheduler = SyncScheduler(settings.sync_interval_hours)
    scheduler.start()
    return scheduler
