from datetime import date

import pyotp

from app.db.models import User

PASSWORD = "senha-qualquer-123"


def test_profile_never_returns_secrets(client, auth_headers):
    res = client.get("/profile", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["email"] == "dono@exemplo.com"
    assert body["totp_enabled"] is False
    keys = {k["env"]: k for k in body["keys"]}
    assert keys["PLUGGY_CLIENT_SECRET"]["configured"] is True
    assert keys["JWT_SECRET"]["status"] == "ok"
    assert keys["FIELD_ENCRYPTION_KEY"]["status"] == "ok"
    # Nenhum segredo inteiro na resposta
    assert "test-secret" not in res.text
    assert "test-secret-with-enough-length" not in res.text


def test_change_password_requires_current(client, auth_headers, db):
    wrong = client.put(
        "/profile/password", json={"current": "errada", "new": "x" * 12}, headers=auth_headers
    )
    assert wrong.status_code == 400
    short = client.put(
        "/profile/password", json={"current": PASSWORD, "new": "curta"}, headers=auth_headers
    )
    assert short.status_code == 400

    new = "uma-senha-nova-e-longa"
    ok = client.put(
        "/profile/password", json={"current": PASSWORD, "new": new}, headers=auth_headers
    )
    assert ok.status_code == 204
    login = client.post("/auth/login", json={"email": "dono@exemplo.com", "password": new})
    assert login.status_code == 200


def test_change_email(client, auth_headers, db):
    db.add(User(email="outro@exemplo.com", password_hash="x"))
    db.commit()
    taken = client.put(
        "/profile/email",
        json={"email": "outro@exemplo.com", "password": PASSWORD},
        headers=auth_headers,
    )
    assert taken.status_code == 409
    ok = client.put(
        "/profile/email",
        json={"email": "Novo@Exemplo.com", "password": PASSWORD},
        headers=auth_headers,
    )
    assert ok.status_code == 204
    assert client.get("/profile", headers=auth_headers).json()["email"] == "novo@exemplo.com"


def test_totp_enable_and_disable(client, auth_headers):
    setup = client.post("/profile/totp/setup", headers=auth_headers).json()
    assert setup["qr_svg"].startswith("data:image/svg+xml")
    secret = setup["secret"]

    bad = client.post(
        "/profile/totp/enable",
        json={"password": PASSWORD, "secret": secret, "code": "000000"},
        headers=auth_headers,
    )
    assert bad.status_code == 400

    code = pyotp.TOTP(secret).now()
    ok = client.post(
        "/profile/totp/enable",
        json={"password": PASSWORD, "secret": secret, "code": code},
        headers=auth_headers,
    )
    assert ok.status_code == 204
    assert client.get("/profile", headers=auth_headers).json()["totp_enabled"] is True

    # O login passa a pedir o código
    login = client.post("/auth/login", json={"email": "dono@exemplo.com", "password": PASSWORD})
    assert login.json()["detail"] == "TOTP_REQUIRED"

    off = client.post(
        "/profile/totp/disable",
        json={"password": PASSWORD, "code": pyotp.TOTP(secret).now()},
        headers=auth_headers,
    )
    assert off.status_code == 204
    assert client.get("/profile", headers=auth_headers).json()["totp_enabled"] is False


def test_mascot_choice(client, auth_headers, db):
    from app.services.assistant import system_prompt

    assert client.get("/auth/me", headers=auth_headers).json()["mascot"] == "pila"
    bad = client.put("/profile/mascot", json={"mascot": "dragao"}, headers=auth_headers)
    assert bad.status_code == 422
    ok = client.put("/profile/mascot", json={"mascot": "guara"}, headers=auth_headers)
    assert ok.status_code == 204
    assert client.get("/auth/me", headers=auth_headers).json()["mascot"] == "guara"
    # O assistente se apresenta com o nome do mascote escolhido
    assert system_prompt(db, date(2026, 10, 20)).startswith("Você é o Guará,")


def test_change_username(client, auth_headers, db):
    db.add(User(email="outro@exemplo.com", username="ocupado", password_hash="x"))
    db.commit()

    def put(username, password=PASSWORD):
        body = {"username": username, "password": password}
        return client.put("/profile/username", json=body, headers=auth_headers)

    assert put("dono", "errada").status_code == 400
    assert put("a").status_code == 400  # curto
    assert put("tem espaço").status_code == 400
    assert put("e@mail").status_code == 400
    assert put("ocupado").status_code == 409
    assert put("Dono.Leal").status_code == 204
    assert client.get("/profile", headers=auth_headers).json()["username"] == "dono.leal"
    assert client.get("/auth/me", headers=auth_headers).json()["username"] == "dono.leal"
    assert put("").status_code == 204
    assert client.get("/profile", headers=auth_headers).json()["username"] is None
