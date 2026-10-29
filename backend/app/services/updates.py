"""Aviso de versão nova do programa (.app/.exe).

Pergunta ao GitHub qual é a última Release e, se for mais nova que a instalada, devolve o link
do instalador deste sistema. Nada além disso sai do computador: é um GET público, sem dados.
A pessoa baixa e instala por cima (os dados ficam na pasta ManagerFinance). No modo web quem
atualiza é o `git pull`, então lá o aviso fica desligado.
"""

import logging
import sys
import time
import tomllib
from pathlib import Path

import httpx
from sqlalchemy.orm import Session

from app.db.models import AppSetting

logger = logging.getLogger(__name__)

REPO = "daniellealpimenta/Finora"
RELEASES_URL = f"https://github.com/{REPO}/releases"
_LATEST_API = f"https://api.github.com/repos/{REPO}/releases/latest"
# Os mesmos nomes do .github/workflows/release.yml
ASSETS = {"darwin": "Finora-macOS.dmg", "win32": "Finora-Windows-Setup.exe"}

SETTING_KEY = "update"  # {"dismissed": "0.2.0"}: "Agora não" para essa versão
# A API do GitHub sem login aceita 60 consultas/hora: uma a cada poucas horas basta
_CACHE_SECONDS = 6 * 3600
_RETRY_SECONDS = 30 * 60
_cache: tuple[float, str | None] | None = None

# No .exe/.app o pyproject.toml vai junto (managerfinance.spec)
_BACKEND_DIR = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[2]))


def current_version() -> str:
    pyproject = tomllib.loads((_BACKEND_DIR / "pyproject.toml").read_text(encoding="utf-8"))
    return pyproject["project"]["version"]


def is_desktop() -> bool:
    return bool(getattr(sys, "frozen", False))


def _parse(version: str) -> tuple[int, ...]:
    try:
        return tuple(int(part) for part in version.removeprefix("v").split("."))
    except ValueError:
        return ()


def latest_version() -> str | None:
    """Última Release publicada ("0.2.0"), ou None se o GitHub não respondeu. Fica em cache:
    toda tela do app pergunta, mas o GitHub só é consultado a cada algumas horas."""
    global _cache
    now = time.monotonic()
    if _cache:
        fetched_at, version = _cache
        if now - fetched_at < (_CACHE_SECONDS if version else _RETRY_SECONDS):
            return version
    version = None
    try:
        res = httpx.get(_LATEST_API, timeout=5, headers={"Accept": "application/vnd.github+json"})
        res.raise_for_status()
        version = res.json()["tag_name"].removeprefix("v")
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        logger.info("Sem resposta do GitHub sobre versão nova: %s", exc)
    _cache = (now, version)
    return version


def check(db: Session) -> dict:
    current = current_version()
    out = {
        "current": current,
        "latest": None,
        "available": False,
        "download_url": None,
        "notes_url": None,
    }
    asset = ASSETS.get(sys.platform)
    if not is_desktop() or not asset:
        return out
    latest = latest_version()
    out["latest"] = latest
    if not latest or _parse(latest) <= _parse(current):
        return out
    setting = db.get(AppSetting, SETTING_KEY)
    if setting and (setting.value or {}).get("dismissed") == latest:
        return out
    out["available"] = True
    out["download_url"] = f"{RELEASES_URL}/download/v{latest}/{asset}"
    out["notes_url"] = f"{RELEASES_URL}/tag/v{latest}"
    return out


def dismiss(db: Session, version: str) -> None:
    setting = db.get(AppSetting, SETTING_KEY)
    if setting is None:
        db.add(AppSetting(key=SETTING_KEY, value={"dismissed": version}))
    else:
        setting.value = {**(setting.value or {}), "dismissed": version}
    db.commit()
