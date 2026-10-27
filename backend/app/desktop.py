"""Lançador do programa para Windows (ManagerFinance.exe).

Sobe a API + o frontend estático num processo só e abre uma janela nativa (WebView2).
No modo web (uvicorn + npm run dev) este arquivo não é usado.
"""

import logging
import shutil
import sys
import threading
import time
import urllib.request
from pathlib import Path

from app.core.config import DATA_DIR

PORT = 8765  # o frontend é gerado com esta porta (scripts/build-desktop.ps1)
URL = f"http://127.0.0.1:{PORT}"

logger = logging.getLogger("desktop")


def _redirect_output() -> None:
    """No .exe sem console, stdout/stderr são None e o logging do uvicorn quebraria."""
    log_dir = DATA_DIR / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log = open(log_dir / "app.log", "a", encoding="utf-8", buffering=1)  # noqa: SIM115
    sys.stdout = sys.stderr = log


def _alert(message: str) -> None:
    import ctypes

    ctypes.windll.user32.MessageBoxW(None, message, "ManagerFinance", 0x10)


def _is_running() -> bool:
    try:
        with urllib.request.urlopen(f"{URL}/health", timeout=1) as res:
            return res.status == 200
    except OSError:
        return False


def _migrate() -> None:
    """Atualiza o banco sozinho (no modo web é o `alembic upgrade head` manual).
    Antes de mexer, guarda uma cópia do banco."""
    from alembic import command
    from alembic.config import Config
    from alembic.runtime.migration import MigrationContext
    from alembic.script import ScriptDirectory
    from sqlalchemy.engine import make_url

    from app.db.session import engine
    from app.main import _BACKEND_DIR

    # Config sem arquivo: o fileConfig do alembic.ini desligaria os loggers da aplicação
    cfg = Config()
    cfg.set_main_option("script_location", str(_BACKEND_DIR / "migrations"))
    heads = set(ScriptDirectory.from_config(cfg).get_heads())
    with engine.connect() as conn:
        current = set(MigrationContext.configure(conn).get_current_heads())
    if current == heads:
        return

    database = make_url(str(engine.url)).database
    if current and database and Path(database).is_file():
        shutil.copy2(database, f"{database}.bak")
        logger.info("Backup do banco em %s.bak", database)
    command.upgrade(cfg, "head")


def _start_server():
    import uvicorn

    from app.main import app

    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=PORT, log_config=None))
    thread = threading.Thread(target=server.run, name="api", daemon=True)
    thread.start()
    deadline = time.monotonic() + 30
    while not _is_running():
        if not thread.is_alive() or time.monotonic() > deadline:
            raise RuntimeError(f"A API não subiu; veja {DATA_DIR / 'logs' / 'app.log'}")
        time.sleep(0.2)
    return server, thread


def main() -> None:
    if getattr(sys, "frozen", False):
        _redirect_output()
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s - %(message)s", force=True
    )

    import webview

    # Já aberto (outra janela): reaproveita o servidor em vez de disputar o banco
    server = thread = None
    if not _is_running():
        try:
            from app.core.config import ensure_local_secrets

            # O resto (senha, chaves da Pluggy) o passo a passo do app pede na primeira vez
            ensure_local_secrets()
            _migrate()
            server, thread = _start_server()
        except Exception as exc:
            logger.exception("Falha ao iniciar")
            _alert(str(exc))
            sys.exit(1)

    # meu.pluggy.ai, dashboard.pluggy.ai etc. abrem no navegador, não dentro do app
    webview.settings["OPEN_EXTERNAL_LINKS_IN_BROWSER"] = True
    webview.create_window("ManagerFinance", URL, width=1400, height=900, min_size=(1024, 680))
    webview.start()

    if server:
        server.should_exit = True  # o lifespan para o scheduler de sync
        thread.join(timeout=10)


if __name__ == "__main__":
    main()
