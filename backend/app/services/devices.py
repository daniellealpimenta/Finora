"""Celulares pareados (app finoraMobile).

Pareamento: o PC (já logado) pede um código de 6 dígitos que vale 5 minutos e aparece num QR
junto com o endereço da API na Tailscale. O celular troca o código por um token de aparelho
longo, que fica no armazenamento seguro dele. Senha nenhuma passa pela rede.

Proteção contra chute: 5 códigos errados seguidos apagam todos os códigos ativos (com 6 dígitos,
a chance de acertar antes disso é de 1 em 200 mil). Os códigos ficam só em memória.

"Acesso pelo celular" é uma opção do PC (AppSetting "phone_access"), desligada por padrão. Com
ela desligada, nada de fora do computador entra, nem com token válido.
"""

import secrets
import threading
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_device_token, new_device_token
from app.db.models import AppSetting, Device, User

CODE_TTL = timedelta(minutes=5)
MAX_FAILURES = 5
ACCESS_KEY = "phone_access"


@dataclass
class _Code:
    user_id: int
    expires_at: datetime


_lock = threading.Lock()
_codes: dict[str, _Code] = {}
_failures = 0
# Espelho da opção "phone_access" para o middleware de rede não abrir o banco a cada pedido
_access_enabled = False


def _now() -> datetime:
    return datetime.now(UTC)


def new_pair_code(user_id: int) -> tuple[str, datetime]:
    with _lock:
        now = _now()
        for code in [c for c, v in _codes.items() if v.expires_at <= now]:
            del _codes[code]
        code = f"{secrets.randbelow(1_000_000):06d}"
        expires = now + CODE_TTL
        _codes[code] = _Code(user_id, expires)
        return code, expires


class PairError(Exception):
    pass


def redeem_pair_code(code: str) -> int:
    """Devolve o usuário do código (que deixa de valer) ou lança PairError."""
    global _failures
    with _lock:
        entry = _codes.pop(code.strip(), None)
        if entry is None or entry.expires_at <= _now():
            _failures += 1
            if _failures >= MAX_FAILURES:
                _codes.clear()
                _failures = 0
                raise PairError("Muitos códigos errados. Gere um código novo no computador.")
            raise PairError("Código inválido ou vencido. Gere um novo no computador.")
        _failures = 0
        return entry.user_id


def create_device(db: Session, user: User, name: str) -> tuple[Device, str]:
    token = new_device_token()
    device = Device(
        user_id=user.id, name=name.strip()[:80] or "Celular", token_hash=hash_device_token(token)
    )
    db.add(device)
    db.commit()
    db.refresh(device)
    return device, token


def user_for_token(db: Session, token: str) -> User | None:
    device = db.scalar(select(Device).where(Device.token_hash == hash_device_token(token)))
    if device is None:
        return None
    device.last_seen_at = _now()
    db.commit()
    return db.get(User, device.user_id)


def list_devices(db: Session, user: User) -> list[Device]:
    return list(
        db.scalars(
            select(Device).where(Device.user_id == user.id).order_by(Device.created_at.desc())
        )
    )


def remove_device(db: Session, user: User, device_id: int) -> bool:
    device = db.get(Device, device_id)
    if device is None or device.user_id != user.id:
        return False
    db.delete(device)
    db.commit()
    return True


# --- opção "Acesso pelo celular" ------------------------------------------------------


def load_access(db: Session) -> bool:
    global _access_enabled
    setting = db.get(AppSetting, ACCESS_KEY)
    _access_enabled = bool(setting and setting.value.get("enabled"))
    return _access_enabled


def set_access(db: Session, enabled: bool) -> None:
    global _access_enabled
    setting = db.get(AppSetting, ACCESS_KEY)
    if setting is None:
        db.add(AppSetting(key=ACCESS_KEY, value={"enabled": enabled}))
    else:
        setting.value = {"enabled": enabled}
    db.commit()
    _access_enabled = enabled


def access_enabled() -> bool:
    return _access_enabled


def reset_for_tests() -> None:
    global _failures, _access_enabled
    with _lock:
        _codes.clear()
        _failures = 0
    _access_enabled = False
