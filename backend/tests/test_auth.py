import pyotp
import pytest

from app.core.security import encrypt_field, hash_password
from app.db.models import User

PASSWORD = "uma-senha-bem-longa"


@pytest.fixture
def totp_secret(db) -> str:
    secret = pyotp.random_base32()
    db.add(
        User(
            email="eu@exemplo.com",
            password_hash=hash_password(PASSWORD),
            totp_secret=encrypt_field(secret),
        )
    )
    db.commit()
    return secret


def test_health(client):
    assert client.get("/health").json()["status"] == "ok"


def test_login_with_totp_and_me(client, totp_secret):
    resp = client.post(
        "/auth/login",
        json={
            "email": "EU@exemplo.com",
            "password": PASSWORD,
            "totp_code": pyotp.TOTP(totp_secret).now(),
        },
    )
    assert resp.status_code == 200
    token = resp.json()["access_token"]

    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "eu@exemplo.com"


@pytest.mark.parametrize(
    "password,code",
    [("senha-errada-123", None), (PASSWORD, None), (PASSWORD, "000000")],
)
def test_login_rejects_bad_credentials(client, totp_secret, password, code):
    resp = client.post(
        "/auth/login",
        json={"email": "eu@exemplo.com", "password": password, "totp_code": code},
    )
    assert resp.status_code == 401


def test_me_requires_token(client):
    assert client.get("/auth/me").status_code == 401
    bad = client.get("/auth/me", headers={"Authorization": "Bearer lixo"})
    assert bad.status_code == 401


def test_login_without_totp_code_asks_for_it(client, totp_secret):
    resp = client.post("/auth/login", json={"email": "eu@exemplo.com", "password": PASSWORD})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "TOTP_REQUIRED"


def test_login_password_only_when_totp_disabled(client, db):
    db.add(User(email="semtotp@exemplo.com", password_hash=hash_password(PASSWORD)))
    db.commit()
    resp = client.post("/auth/login", json={"email": "semtotp@exemplo.com", "password": PASSWORD})
    assert resp.status_code == 200
    assert "access_token" in resp.json()
