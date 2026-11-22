"""Quem pode falar com a API.

Do próprio computador (loopback): tudo, como sempre foi.
De fora: só com o "Acesso pelo celular" ligado, só de um endereço da Tailscale e, fora o
pareamento e o login, só com token de aparelho. Qualquer outro pedido recebe 403 antes de chegar
às rotas, mesmo que alguém na rede local descubra a porta.
"""

import ipaddress

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core import tailscale
from app.core.security import DEVICE_TOKEN_PREFIX
from app.services import devices

# De fora, sem token de aparelho, só estas rotas (o celular ainda não tem token)
_OPEN_PATHS = {("GET", "/health"), ("POST", "/devices/pair"), ("POST", "/auth/login")}
# Com o token curto do login por senha, o celular só pode trocá-lo por um de aparelho
_JWT_PATHS = {("POST", "/devices")}


def _is_loopback(host: str) -> bool:
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def _deny(message: str) -> JSONResponse:
    return JSONResponse({"detail": message}, status_code=403)


class RemoteAccessMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return
        client = scope.get("client")
        host = client[0] if client else ""
        if _is_loopback(host):
            await self.app(scope, receive, send)
            return

        if not devices.access_enabled():
            await _deny("Acesso pelo celular desligado neste computador")(scope, receive, send)
            return
        if not tailscale.is_tailscale(host):
            await _deny("Só pela Tailscale")(scope, receive, send)
            return

        key = (scope.get("method", "GET"), scope.get("path", ""))
        if key not in _OPEN_PATHS:
            auth = dict(scope.get("headers") or []).get(b"authorization", b"").decode()
            token = auth.removeprefix("Bearer ").strip()
            if not token.startswith(DEVICE_TOKEN_PREFIX) and key not in _JWT_PATHS:
                await _deny("Pareie este celular pelo Perfil do Finora")(scope, receive, send)
                return
        await self.app(scope, receive, send)
