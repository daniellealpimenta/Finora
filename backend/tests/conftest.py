import os

from cryptography.fernet import Fernet

# Configuração de teste antes de importar a aplicação
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["JWT_SECRET"] = "test-secret-with-enough-length-0123456789"
os.environ["FIELD_ENCRYPTION_KEY"] = Fernet.generate_key().decode()
os.environ["PLUGGY_CLIENT_ID"] = "test-client"
os.environ["PLUGGY_CLIENT_SECRET"] = "test-secret"
os.environ["SCHEDULER_ENABLED"] = "false"
# Nunca usar a conta de e-mail do .env de quem roda os testes
os.environ["SMTP_USER"] = ""
os.environ["SMTP_PASSWORD"] = ""

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.db.session import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture
def db() -> Session:
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, expire_on_commit=False)()
    yield session
    session.close()
    engine.dispose()


@pytest.fixture
def client(db: Session) -> TestClient:
    app.dependency_overrides[get_db] = lambda: db
    # Como o navegador e o programa: do próprio computador (ver app/api/network.py)
    yield TestClient(app, client=("127.0.0.1", 50000))
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def _fresh_device_state():
    """Códigos de pareamento, opção de acesso e limite de login ficam em memória."""
    from app.core import ratelimit
    from app.services import devices

    devices.reset_for_tests()
    ratelimit.reset_for_tests()
    yield
    devices.reset_for_tests()
    ratelimit.reset_for_tests()


@pytest.fixture
def auth_headers(db: Session) -> dict[str, str]:
    from app.core.security import create_access_token, hash_password
    from app.db.models import User

    user = User(email="dono@exemplo.com", password_hash=hash_password("senha-qualquer-123"))
    db.add(user)
    db.commit()
    return {"Authorization": f"Bearer {create_access_token(str(user.id))}"}


@pytest.fixture(autouse=True)
def _no_real_email(monkeypatch):
    """Nenhum teste fala com um servidor de e-mail de verdade."""
    import smtplib

    def blocked(*args, **kwargs):
        raise AssertionError("teste tentou abrir conexão SMTP real")

    monkeypatch.setattr(smtplib, "SMTP", blocked)
    monkeypatch.setattr(smtplib, "SMTP_SSL", blocked)
