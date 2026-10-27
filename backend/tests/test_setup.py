import httpx
import pytest
import respx

from app.core import config
from app.db.models import Connection

BASE = "https://api.pluggy.ai"


@pytest.fixture
def local_env(tmp_path, monkeypatch):
    """.env da pasta de dados numa pasta temporária, longe dos dados reais."""
    monkeypatch.setattr(config, "DATA_DIR", tmp_path)
    monkeypatch.setattr(config, "LOCAL_ENV", tmp_path / ".env")
    yield tmp_path / ".env"
    config.get_settings.cache_clear()


def test_status_fresh_install(client):
    body = client.get("/setup/status").json()
    assert body["has_user"] is False
    assert body["has_connection"] is False
    assert body["done"] is False


def test_status_counts_existing_install_as_done(client, db, auth_headers):
    db.add(Connection(external_id="x", institution_name="Banco"))
    db.commit()
    assert client.get("/setup/status").json()["done"] is True


def test_first_user_only_once(client):
    created = client.post(
        "/setup/user", json={"email": "Eu@Exemplo.com", "password": "senha-bem-longa", "totp": True}
    )
    assert created.status_code == 201
    body = created.json()
    assert body["totp_uri"].startswith("otpauth://")
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.json()["email"] == "eu@exemplo.com"

    again = client.post("/setup/user", json={"email": "outro@exemplo.com", "password": "x" * 20})
    assert again.status_code == 409


def test_first_user_rejects_short_password(client):
    res = client.post("/setup/user", json={"email": "eu@exemplo.com", "password": "curta"})
    assert res.status_code == 422
    assert client.get("/setup/status").json()["has_user"] is False


@respx.mock
def test_pluggy_keys_saved_only_when_valid(client, auth_headers, local_env):
    auth = respx.post(f"{BASE}/auth").mock(
        side_effect=[httpx.Response(401, json={}), httpx.Response(200, json={"apiKey": "k"})]
    )
    keys = {"client_id": " id-1 ", "client_secret": "segredo"}

    assert client.put("/setup/pluggy", json=keys, headers=auth_headers).status_code == 400
    assert not local_env.exists()

    assert client.put("/setup/pluggy", json=keys, headers=auth_headers).status_code == 204
    assert auth.calls[1].request.content == b'{"clientId":"id-1","clientSecret":"segredo"}'
    text = local_env.read_text(encoding="utf-8")
    assert "PLUGGY_CLIENT_ID=id-1\n" in text
    assert "PLUGGY_CLIENT_SECRET=segredo\n" in text


def test_pluggy_keys_require_login(client):
    assert (
        client.put("/setup/pluggy", json={"client_id": "a", "client_secret": "b"}).status_code
        == 401
    )


def test_progress(client, auth_headers):
    res = client.put("/setup/progress", json={"step": "pluggy"}, headers=auth_headers)
    assert res.status_code == 204
    body = client.get("/setup/status").json()
    assert body["step"] == "pluggy"
    assert body["done"] is False


def test_save_local_settings_keeps_other_lines(local_env):
    local_env.write_text("# comentário\nJWT_SECRET=abc\nPLUGGY_CLIENT_ID=velho\n", encoding="utf-8")
    config.save_local_settings({"PLUGGY_CLIENT_ID": "novo", "PLUGGY_CLIENT_SECRET": "s"})
    assert local_env.read_text(encoding="utf-8") == (
        "# comentário\nJWT_SECRET=abc\nPLUGGY_CLIENT_ID=novo\nPLUGGY_CLIENT_SECRET=s\n"
    )


def test_ensure_local_secrets_never_overwrites(local_env, monkeypatch):
    monkeypatch.delenv("JWT_SECRET")
    monkeypatch.delenv("FIELD_ENCRYPTION_KEY")
    monkeypatch.setattr(
        config.Settings, "model_config", {**config.Settings.model_config, "env_file": local_env}
    )
    config.get_settings.cache_clear()

    config.ensure_local_secrets()
    first = local_env.read_text(encoding="utf-8")
    assert "JWT_SECRET=" in first and "FIELD_ENCRYPTION_KEY=" in first

    config.ensure_local_secrets()
    assert local_env.read_text(encoding="utf-8") == first
