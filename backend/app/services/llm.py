"""Ollama local: catálogo de modelos, download e remoção, e chat.

O Ollama é um programa separado que roda nesta máquina (`llm_base_url`, só loopback). Os
pesos ficam em ~/.ollama, fora da pasta do projeto. Daqui só saem pedidos para ele: nada vai
para a internet além do próprio download do modelo, que o Ollama faz do registro dele.
"""

import json
import logging
import threading
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import UTC, datetime

import httpx
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import AppSetting

logger = logging.getLogger(__name__)

SETTING_KEY = "assistant"

# Só estes podem ser baixados ou removidos pelo app. Tamanhos aproximados (Q4, do registro
# do Ollama); `memory` é o que ocupa na RAM ao responder, com contexto de 16k.
CATALOG: list[dict] = [
    {
        "name": "qwen3:8b",
        "label": "Qwen3 8B",
        "size_gb": 5.2,
        "memory_gb": 7,
        "note": "Recomendado: bom português e boa chamada de ferramentas.",
    },
    {
        "name": "qwen3:4b",
        "label": "Qwen3 4B",
        "size_gb": 2.5,
        "memory_gb": 4,
        "note": "Mais leve e rápido; erra mais em perguntas com várias etapas.",
    },
    {
        "name": "qwen3:14b",
        "label": "Qwen3 14B",
        "size_gb": 9.3,
        "memory_gb": 12,
        "note": "Respostas melhores, mais lento. Cabe nos 24 GB, mas pesa com outros apps abertos.",
    },
]
DEFAULT_MODEL = "qwen3:8b"
CONTEXT_TOKENS = 16384
_STATUS_TIMEOUT = httpx.Timeout(3.0)
# Download e resposta podem demorar; só a conexão tem prazo curto
_STREAM_TIMEOUT = httpx.Timeout(10.0, read=None)


class LlmError(Exception):
    """Mensagem já pronta para o usuário."""


def catalog_entry(name: str) -> dict | None:
    return next((m for m in CATALOG if m["name"] == name), None)


def _url(path: str) -> str:
    return f"{get_settings().llm_base_url}{path}"


def _same_model(a: str, b: str) -> bool:
    """O Ollama lista "qwen3:8b"; sem tag, o nome vale como ":latest"."""

    def full(n: str) -> str:
        return n if ":" in n else f"{n}:latest"

    return full(a) == full(b)


# --- preferências -------------------------------------------------------------


def get_model(db: Session) -> str:
    setting = db.get(AppSetting, SETTING_KEY)
    chosen = (setting.value or {}).get("model") if setting else None
    return chosen or DEFAULT_MODEL


def set_model(db: Session, name: str) -> None:
    setting = db.get(AppSetting, SETTING_KEY)
    if setting is None:
        db.add(AppSetting(key=SETTING_KEY, value={"model": name}))
    else:
        setting.value = {**(setting.value or {}), "model": name}
    db.commit()


# --- status -------------------------------------------------------------------


def installed(http: httpx.Client | None = None) -> list[dict] | None:
    """Modelos baixados ({name, size}); None se o Ollama não está rodando."""
    client = http or httpx.Client(timeout=_STATUS_TIMEOUT)
    try:
        resp = client.get(_url("/api/tags"))
        resp.raise_for_status()
    except httpx.HTTPError:
        return None
    finally:
        if http is None:
            client.close()
    return [{"name": m["name"], "size": m.get("size", 0)} for m in resp.json().get("models", [])]


def is_installed(name: str, models: list[dict] | None) -> bool:
    return any(_same_model(m["name"], name) for m in models or [])


# --- download e remoção -------------------------------------------------------


@dataclass
class PullState:
    model: str | None = None
    running: bool = False
    status: str = ""
    # Soma das camadas: cada uma chega com seu total e quanto já veio
    layers: dict[str, tuple[int, int]] = field(default_factory=dict)
    error: str | None = None
    finished_at: datetime | None = None
    cancel: bool = False

    @property
    def total(self) -> int:
        return sum(t for t, _ in self.layers.values())

    @property
    def completed(self) -> int:
        return sum(c for _, c in self.layers.values())


pull_state = PullState()
_pull_lock = threading.Lock()


def pull(name: str, http: httpx.Client | None = None) -> None:
    """Baixa o modelo pelo Ollama, atualizando `pull_state`. Roda em segundo plano."""
    if not _pull_lock.acquire(blocking=False):
        return
    global pull_state
    pull_state = PullState(model=name, running=True, status="Começando")
    client = http or httpx.Client(timeout=_STREAM_TIMEOUT)
    try:
        with client.stream("POST", _url("/api/pull"), json={"model": name}) as resp:
            resp.raise_for_status()
            for line in resp.iter_lines():
                if pull_state.cancel:
                    pull_state.error = "Download cancelado"
                    break
                if not line:
                    continue
                event = json.loads(line)
                if event.get("error"):
                    raise LlmError(event["error"])
                pull_state.status = event.get("status", "")
                if event.get("digest") and event.get("total"):
                    pull_state.layers[event["digest"]] = (
                        event["total"],
                        event.get("completed", 0),
                    )
    except httpx.HTTPError:
        logger.exception("Download do modelo falhou")
        pull_state.error = "Não deu para falar com o Ollama. Ele está aberto?"
    except LlmError as e:
        pull_state.error = str(e)
    finally:
        pull_state.running = False
        pull_state.finished_at = datetime.now(UTC)
        if http is None:
            client.close()
        _pull_lock.release()


def delete(name: str, http: httpx.Client | None = None) -> None:
    client = http or httpx.Client(timeout=_STATUS_TIMEOUT)
    try:
        resp = client.request("DELETE", _url("/api/delete"), json={"model": name})
    except httpx.HTTPError:
        raise LlmError("Não deu para falar com o Ollama. Ele está aberto?") from None
    finally:
        if http is None:
            client.close()
    if resp.status_code == 404:
        return  # já não estava instalado
    if resp.is_error:
        raise LlmError(f"O Ollama recusou a remoção ({resp.status_code})")


# --- chat ---------------------------------------------------------------------


def chat_stream(
    model: str, messages: list[dict], tools: list[dict], http: httpx.Client | None = None
) -> Iterator[dict]:
    """Uma rodada de chat em streaming: devolve os pedaços `message` do Ollama.

    `think: false` desliga o raciocínio longo do Qwen3: responde bem mais rápido, e as contas
    já vêm prontas das ferramentas."""
    body = {
        "model": model,
        "messages": messages,
        "tools": tools,
        "stream": True,
        "think": False,
        "options": {"num_ctx": CONTEXT_TOKENS, "temperature": 0.3},
    }
    client = http or httpx.Client(timeout=_STREAM_TIMEOUT)
    try:
        with client.stream("POST", _url("/api/chat"), json=body) as resp:
            if resp.status_code == 404:
                raise LlmError(f"O modelo {model} não está baixado.")
            resp.raise_for_status()
            for line in resp.iter_lines():
                if not line:
                    continue
                event = json.loads(line)
                if event.get("error"):
                    raise LlmError(event["error"])
                if event.get("message"):
                    yield event["message"]
    except httpx.HTTPError:
        raise LlmError("Não deu para falar com o Ollama. Ele está aberto?") from None
    finally:
        if http is None:
            client.close()
