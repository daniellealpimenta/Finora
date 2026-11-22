"""Tailscale: a rede privada (WireGuard) por onde o celular alcança este computador.

O celular só fala com o Finora por ela: fora do próprio computador, a API aceita apenas
endereços da Tailscale (100.64.0.0/10 e fd7a:115c:a1e0::/48). Ver app/api/network.py.
"""

import ipaddress
import shutil
import socket
import subprocess
from pathlib import Path

TAILSCALE_NETS = (
    ipaddress.ip_network("100.64.0.0/10"),
    ipaddress.ip_network("fd7a:115c:a1e0::/48"),
)
# Endereço fixo do DNS da Tailscale: a rota até ele sai pela interface da Tailscale
_MAGIC_DNS = "100.100.100.100"
_MAC_CLI = Path("/Applications/Tailscale.app/Contents/MacOS/Tailscale")


def is_tailscale(host: str) -> bool:
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    return any(ip in net for net in TAILSCALE_NETS)


def _via_route() -> str | None:
    """IP local usado para chegar ao DNS da Tailscale. Não manda pacote (UDP sem envio)."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect((_MAGIC_DNS, 53))
            ip = s.getsockname()[0]
    except OSError:
        return None
    return ip if is_tailscale(ip) else None


def _via_cli() -> str | None:
    cli = shutil.which("tailscale") or (str(_MAC_CLI) if _MAC_CLI.exists() else None)
    if not cli:
        return None
    try:
        out = subprocess.run([cli, "ip", "-4"], capture_output=True, text=True, timeout=3).stdout
    except (OSError, subprocess.SubprocessError):
        return None
    ip = out.strip().splitlines()[0] if out.strip() else ""
    return ip if is_tailscale(ip) else None


def local_ip() -> str | None:
    """IP deste computador na Tailscale (100.x.y.z), ou None se ela não estiver ligada."""
    return _via_route() or _via_cli()
