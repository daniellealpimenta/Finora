"""Limite de tentativas de login por endereço: 10 erros em 15 minutos bloqueiam aquele IP até
a janela passar. Em memória (a API é de uma pessoa só); reinicia junto com o programa."""

import threading
import time
from collections import defaultdict, deque

WINDOW = 15 * 60
MAX_FAILURES = 10

_lock = threading.Lock()
_failures: dict[str, deque[float]] = defaultdict(deque)


def _prune(q: deque[float], now: float) -> None:
    while q and now - q[0] > WINDOW:
        q.popleft()


def blocked(key: str) -> bool:
    with _lock:
        q = _failures[key]
        _prune(q, time.monotonic())
        return len(q) >= MAX_FAILURES


def fail(key: str) -> None:
    with _lock:
        q = _failures[key]
        now = time.monotonic()
        _prune(q, now)
        q.append(now)


def clear(key: str) -> None:
    with _lock:
        _failures.pop(key, None)


def reset_for_tests() -> None:
    with _lock:
        _failures.clear()
