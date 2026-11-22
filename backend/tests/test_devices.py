from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.core import tailscale
from app.db.models import Device
from app.db.session import get_db
from app.main import app
from app.services import devices

PHONE_IP = ("100.101.102.103", 50001)


@pytest.fixture
def access_on(client, auth_headers):
    assert (
        client.put("/devices/access", json={"enabled": True}, headers=auth_headers).status_code
        == 200
    )


@pytest.fixture
def phone(db):
    """Um celular falando pela Tailscale."""
    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app, client=PHONE_IP)
    app.dependency_overrides.clear()


def _pair(client, auth_headers, phone) -> str:
    code = client.post("/devices/pair-code", headers=auth_headers).json()["code"]
    resp = phone.post("/devices/pair", json={"code": code, "name": "iPhone do Daniel"})
    assert resp.status_code == 200, resp.text
    return resp.json()["token"]


def test_pair_code_needs_access_on(client, auth_headers):
    assert client.post("/devices/pair-code", headers=auth_headers).status_code == 409


def test_pairing_gives_a_device_token_that_works(client, auth_headers, access_on, phone, db):
    token = _pair(client, auth_headers, phone)
    assert token.startswith("fd_")
    me = phone.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "dono@exemplo.com"
    device = db.query(Device).one()
    assert device.name == "iPhone do Daniel"
    assert device.last_seen_at is not None
    # Só o hash fica no banco
    assert token not in device.token_hash


def test_code_works_only_once(client, auth_headers, access_on, phone):
    code = client.post("/devices/pair-code", headers=auth_headers).json()["code"]
    assert phone.post("/devices/pair", json={"code": code}).status_code == 200
    assert phone.post("/devices/pair", json={"code": code}).status_code == 401


def test_expired_code_is_refused(client, auth_headers, access_on, phone, monkeypatch):
    code = client.post("/devices/pair-code", headers=auth_headers).json()["code"]
    later = datetime.now(UTC) + devices.CODE_TTL + timedelta(seconds=1)
    monkeypatch.setattr(devices, "_now", lambda: later)
    assert phone.post("/devices/pair", json={"code": code}).status_code == 401


def test_five_wrong_codes_wipe_the_valid_one(client, auth_headers, access_on, phone):
    code = client.post("/devices/pair-code", headers=auth_headers).json()["code"]
    wrong = f"{(int(code) + 1) % 1_000_000:06d}"
    for _ in range(devices.MAX_FAILURES):
        assert phone.post("/devices/pair", json={"code": wrong}).status_code == 401
    assert phone.post("/devices/pair", json={"code": code}).status_code == 401


def test_revoked_device_loses_access(client, auth_headers, access_on, phone):
    token = _pair(client, auth_headers, phone)
    listed = client.get("/devices", headers=auth_headers).json()
    assert [d["name"] for d in listed] == ["iPhone do Daniel"]
    assert client.delete(f"/devices/{listed[0]['id']}", headers=auth_headers).status_code == 204
    assert phone.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_password_login_can_be_swapped_for_a_device_token(client, auth_headers, access_on, phone):
    resp = phone.post(
        "/auth/login", json={"login": "dono@exemplo.com", "password": "senha-qualquer-123"}
    )
    jwt = resp.json()["access_token"]
    created = phone.post(
        "/devices", json={"name": "Android"}, headers={"Authorization": f"Bearer {jwt}"}
    )
    assert created.status_code == 201
    token = created.json()["token"]
    assert (
        phone.get("/dashboard/cycle", headers={"Authorization": f"Bearer {token}"}).status_code
        == 200
    )


def test_access_reports_tailscale_url(client, auth_headers, monkeypatch):
    monkeypatch.setattr(tailscale, "local_ip", lambda: "100.64.1.2")
    body = client.put("/devices/access", json={"enabled": True}, headers=auth_headers).json()
    assert body["enabled"] is True
    assert body["url"] == "http://100.64.1.2:80"
    # Testes não rodam pelo desktop.py: o servidor não está escutando fora do 127.0.0.1
    assert body["restart_needed"] is True


def test_login_is_rate_limited(client):
    for _ in range(10):
        r = client.post(
            "/auth/login", json={"login": "ninguem@exemplo.com", "password": "errada-123"}
        )
        assert r.status_code == 401
    r = client.post("/auth/login", json={"login": "ninguem@exemplo.com", "password": "errada-123"})
    assert r.status_code == 429
