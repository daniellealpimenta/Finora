import httpx
import pytest
from cryptography.fernet import Fernet

from app.core import envfile
from app.core.config import Settings, get_settings
from app.db.models import User

PASSWORD = "senha-qualquer-123"


@pytest.fixture
def env_path(tmp_path, monkeypatch):
    """Um .env temporário no lugar do real, sem as variáveis de ambiente do conftest (elas
    venceriam o arquivo)."""
    path = tmp_path / ".env"
    monkeypatch.setattr(envfile, "target", lambda: path)
    monkeypatch.setitem(Settings.model_config, "env_file", (path,))
    for key in ("JWT_SECRET", "FIELD_ENCRYPTION_KEY", "PLUGGY_CLIENT_ID", "PLUGGY_CLIENT_SECRET"):
        monkeypatch.delenv(key)
    get_settings.cache_clear()
    yield path
    get_settings.cache_clear()


@pytest.fixture
def ready_env(env_path):
    """.env de teste já criado, antes do login (o token é assinado com o JWT_SECRET dele)."""
    envfile.ensure()
    return env_path


def test_ensure_creates_env_with_generated_keys(env_path):
    envfile.ensure()
    s = get_settings()
    assert len(s.jwt_secret) >= 32
    Fernet(s.field_encryption_key.encode())  # chave válida
    assert s.pluggy_client_id == ""
    assert "PLUGGY_CLIENT_SECRET=" in env_path.read_text()


def test_ensure_never_replaces_existing_keys(env_path):
    key = Fernet.generate_key().decode()
    env_path.write_text(f"# meu comentário\nJWT_SECRET=antigo\nFIELD_ENCRYPTION_KEY={key}\n")
    envfile.ensure()
    text = env_path.read_text()
    assert "JWT_SECRET=antigo" in text
    assert f"FIELD_ENCRYPTION_KEY={key}" in text
    assert "# meu comentário" in text


def test_ensure_fills_missing_keys(env_path):
    env_path.write_text("PLUGGY_CLIENT_ID=abc\nFIELD_ENCRYPTION_KEY=\n")
    envfile.ensure()
    s = get_settings()
    assert s.pluggy_client_id == "abc"
    assert s.field_encryption_key
    assert s.jwt_secret != "change-me"


def test_setup_creates_first_user_and_logs_in(client, db):
    assert client.get("/setup").json()["needs_user"] is True
    res = client.post(
        "/setup", json={"email": "Nova@Exemplo.com", "username": "nova", "password": PASSWORD}
    )
    assert res.status_code == 201
    token = res.json()["access_token"]
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
    assert me["email"] == "nova@exemplo.com"
    assert me["username"] == "nova"
    assert client.get("/setup").json()["needs_user"] is False
    assert client.get("/auth/last-login").json() == {"login": "nova@exemplo.com"}


def test_setup_rejects_short_password(client):
    res = client.post("/setup", json={"email": "a@exemplo.com", "password": "curta"})
    assert res.status_code == 400


def test_setup_closed_once_a_user_exists(client, auth_headers, db):
    res = client.post("/setup", json={"email": "intruso@exemplo.com", "password": PASSWORD})
    assert res.status_code == 409
    assert db.query(User).count() == 1


def _pluggy_auth(monkeypatch, status_code: int) -> None:
    def fake_post(self, url, **kwargs):
        return httpx.Response(status_code, json={"apiKey": "k"}, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.Client, "post", fake_post)


def test_profile_saves_pluggy_after_pluggy_accepts(ready_env, client, auth_headers, monkeypatch):
    _pluggy_auth(monkeypatch, 200)
    body = {"client_id": " novo-id ", "client_secret": "novo-segredo", "password": PASSWORD}
    res = client.put("/profile/pluggy", json=body, headers=auth_headers)
    assert res.status_code == 204
    s = get_settings()
    assert (s.pluggy_client_id, s.pluggy_client_secret) == ("novo-id", "novo-segredo")


def test_profile_pluggy_rejected_keys_are_not_saved(ready_env, client, auth_headers, monkeypatch):
    _pluggy_auth(monkeypatch, 403)
    body = {"client_id": "x", "client_secret": "y", "password": PASSWORD}
    res = client.put("/profile/pluggy", json=body, headers=auth_headers)
    assert res.status_code == 400
    assert get_settings().pluggy_client_id == ""


def test_profile_pluggy_requires_password(ready_env, client, auth_headers):
    body = {"client_id": "x", "client_secret": "y", "password": "errada"}
    assert client.put("/profile/pluggy", json=body, headers=auth_headers).status_code == 400
