import sqlite3

import pytest
from alembic.script import ScriptDirectory

from app.db import migrate
from app.services import backup

HEAD = ScriptDirectory.from_config(migrate._config()).get_current_head()


def make_db(path, note: str, revision: str = HEAD):
    with sqlite3.connect(path) as conn:
        conn.execute("create table alembic_version (version_num varchar(32))")
        conn.execute("insert into alembic_version values (?)", (revision,))
        conn.execute("create table notes (text varchar)")
        conn.execute("insert into notes values (?)", (note,))


def note_in(path) -> str:
    with sqlite3.connect(path) as conn:
        return conn.execute("select text from notes").fetchone()[0]


@pytest.fixture
def files(tmp_path, monkeypatch):
    """Dois "computadores": o banco de origem e o de destino, cada um num arquivo."""
    source, target = tmp_path / "mac" / "managerfinance.db", tmp_path / "pc" / "managerfinance.db"
    source.parent.mkdir()
    target.parent.mkdir()
    make_db(source, "do Mac")
    make_db(target, "do Windows")
    env: dict[str, str] = {}
    monkeypatch.setattr(migrate, "database_path", lambda: source)
    monkeypatch.setattr(migrate, "current_revision", lambda: HEAD)
    monkeypatch.setattr(migrate, "upgrade", lambda backup=True: None)
    monkeypatch.setattr(backup.envfile, "update", env.update)
    return source, target, env


def test_export_then_restore_on_another_computer(files, monkeypatch):
    source, target, env = files
    data, header = backup.export("senha-longa-1", "daniel")
    assert data.startswith(b"FINORA-BACKUP ")
    info = backup.read_header(data)
    assert (info["owner"], info["compatible"], info["revision"]) == ("daniel", True, HEAD)
    assert b"do Mac" not in data  # o conteúdo vai criptografado

    monkeypatch.setattr(migrate, "database_path", lambda: target)
    restored = backup.restore(data, "senha-longa-1")

    assert note_in(target) == "do Mac"
    kept = target.parent / restored["kept_as"]
    assert note_in(kept) == "do Windows"  # o que havia fica guardado
    # As chaves que os dados precisam vêm junto (a do 2FA e as da Pluggy dos testes)
    assert {"FIELD_ENCRYPTION_KEY", "PLUGGY_CLIENT_ID", "PLUGGY_CLIENT_SECRET"} <= env.keys()
    assert "JWT_SECRET" not in env


def test_wrong_password_and_short_password(files):
    data, _ = backup.export("senha-longa-1", None)
    with pytest.raises(backup.BackupError, match="Senha errada"):
        backup.restore(data, "outra-senha-9")
    with pytest.raises(backup.BackupError, match="pelo menos"):
        backup.export("curta", None)


def test_backup_from_newer_finora_is_refused(files, monkeypatch):
    monkeypatch.setattr(migrate, "current_revision", lambda: "revisao-do-futuro")
    data, _ = backup.export("senha-longa-1", None)
    assert backup.read_header(data)["compatible"] is False
    with pytest.raises(backup.BackupError, match="Atualize o Finora"):
        backup.restore(data, "senha-longa-1")


def test_not_a_backup_file():
    with pytest.raises(backup.BackupError, match="não é um backup"):
        backup.read_header(b"OFXHEADER:100\n...")


def test_inspect_route_and_first_run_import_only_without_user(client, auth_headers, files):
    data, _ = backup.export("senha-longa-1", "daniel")
    info = client.post("/backup/inspect", files={"file": ("x.finora", data)}).json()
    assert info["owner"] == "daniel" and info["compatible"] is True
    bad = client.post("/backup/inspect", files={"file": ("x.ofx", b"lixo")})
    assert bad.status_code == 400
    # Já existe usuário (auth_headers): o import sem login do primeiro acesso é recusado
    first = client.post(
        "/setup/import", files={"file": ("x.finora", data)}, data={"password": "senha-longa-1"}
    )
    assert first.status_code == 409
