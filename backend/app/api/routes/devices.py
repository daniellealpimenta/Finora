"""Celulares pareados: acesso pela Tailscale, código de pareamento e lista de aparelhos."""

import os
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.api.deps import CurrentUser, DbSession
from app.core import tailscale
from app.services import devices

router = APIRouter(prefix="/devices", tags=["celular"])

# O programa (desktop.py) escuta em todas as interfaces só com o acesso pelo celular ligado, e
# avisa por esta variável. No modo web: FINORA_LISTEN_ALL=1 + uvicorn --host 0.0.0.0
LISTEN_ALL_ENV = "FINORA_LISTEN_ALL"


class AccessOut(BaseModel):
    enabled: bool
    tailscale_ip: str | None
    url: str | None
    # Ligado agora, mas o servidor ainda escuta só em 127.0.0.1: reabrir o Finora
    restart_needed: bool


class AccessIn(BaseModel):
    enabled: bool


class PairCodeOut(BaseModel):
    code: str
    expires_at: datetime
    url: str | None


class PairIn(BaseModel):
    code: str = Field(min_length=6, max_length=6)
    name: str = Field(default="Celular", max_length=80)


class DeviceIn(BaseModel):
    name: str = Field(default="Celular", max_length=80)


class DeviceOut(BaseModel):
    id: int
    name: str
    created_at: datetime
    last_seen_at: datetime | None

    model_config = {"from_attributes": True}


class PairOut(BaseModel):
    token: str
    device: DeviceOut
    email: str


def _url(request: Request) -> tuple[str | None, str | None]:
    ip = tailscale.local_ip()
    port = request.url.port or (443 if request.url.scheme == "https" else 80)
    return ip, (f"http://{ip}:{port}" if ip else None)


def _access(request: Request) -> AccessOut:
    enabled = devices.access_enabled()
    ip, url = _url(request)
    return AccessOut(
        enabled=enabled,
        tailscale_ip=ip,
        url=url,
        restart_needed=enabled and os.environ.get(LISTEN_ALL_ENV) != "1",
    )


@router.get("/access", response_model=AccessOut)
def get_access(_: CurrentUser, request: Request) -> AccessOut:
    return _access(request)


@router.put("/access", response_model=AccessOut)
def put_access(body: AccessIn, _: CurrentUser, db: DbSession, request: Request) -> AccessOut:
    devices.set_access(db, body.enabled)
    return _access(request)


@router.post("/pair-code", response_model=PairCodeOut)
def pair_code(user: CurrentUser, request: Request) -> PairCodeOut:
    if not devices.access_enabled():
        raise HTTPException(status.HTTP_409_CONFLICT, "Ligue o acesso pelo celular primeiro")
    code, expires = devices.new_pair_code(user.id)
    return PairCodeOut(code=code, expires_at=expires, url=_url(request)[1])


@router.post("/pair", response_model=PairOut)
def pair(body: PairIn, db: DbSession) -> PairOut:
    """Sem login: o código de 6 dígitos (que só o PC logado gera) é a prova."""
    try:
        user_id = devices.redeem_pair_code(body.code)
    except devices.PairError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from None
    from app.db.models import User

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuário não encontrado")
    device, token = devices.create_device(db, user, body.name)
    return PairOut(token=token, device=DeviceOut.model_validate(device), email=user.email)


@router.post("", response_model=PairOut, status_code=status.HTTP_201_CREATED)
def create_device(body: DeviceIn, user: CurrentUser, db: DbSession) -> PairOut:
    """Alternativa ao QR: o celular entra com e-mail e senha (/auth/login) e troca o token
    curto por um de aparelho."""
    device, token = devices.create_device(db, user, body.name)
    return PairOut(token=token, device=DeviceOut.model_validate(device), email=user.email)


@router.get("", response_model=list[DeviceOut])
def list_devices(user: CurrentUser, db: DbSession) -> list[DeviceOut]:
    return [DeviceOut.model_validate(d) for d in devices.list_devices(db, user)]


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_device(device_id: int, user: CurrentUser, db: DbSession) -> None:
    if not devices.remove_device(db, user, device_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aparelho não encontrado")
