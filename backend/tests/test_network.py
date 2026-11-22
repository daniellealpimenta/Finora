import pytest
from fastapi.testclient import TestClient

from app.db.session import get_db
from app.main import app
from app.services import devices


def _client(db, ip: str) -> TestClient:
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app, client=(ip, 50002))


@pytest.fixture(autouse=True)
def _cleanup():
    yield
    app.dependency_overrides.clear()


def test_loopback_always_works(db, auth_headers):
    c = _client(db, "127.0.0.1")
    assert c.get("/dashboard/cycle", headers=auth_headers).status_code == 200


def test_remote_is_blocked_while_access_is_off(db):
    c = _client(db, "100.101.102.103")
    r = c.get("/health")
    assert r.status_code == 403
    assert "desligado" in r.json()["detail"]


@pytest.mark.parametrize("ip", ["192.168.1.50", "10.0.0.7", "8.8.8.8"])
def test_only_tailscale_addresses_get_in(db, ip):
    devices.set_access(db, True)
    r = _client(db, ip).get("/health")
    assert r.status_code == 403
    assert r.json()["detail"] == "Só pela Tailscale"


def test_tailscale_without_device_token_only_reaches_pairing(db, auth_headers):
    devices.set_access(db, True)
    c = _client(db, "100.101.102.103")
    assert c.get("/health").status_code == 200
    # Token curto do PC não serve para ler dados de fora
    r = c.get("/dashboard/cycle", headers=auth_headers)
    assert r.status_code == 403
    assert c.get("/dashboard/cycle").status_code == 403


def test_tailscale_ipv6_is_accepted(db):
    devices.set_access(db, True)
    assert _client(db, "fd7a:115c:a1e0::1").get("/health").status_code == 200
