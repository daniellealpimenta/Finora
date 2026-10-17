import os

from cryptography.fernet import Fernet

# Configuração de teste antes de importar a aplicação
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["JWT_SECRET"] = "test-secret-with-enough-length-0123456789"
os.environ["FIELD_ENCRYPTION_KEY"] = Fernet.generate_key().decode()
os.environ["PLUGGY_CLIENT_ID"] = "test-client"
os.environ["PLUGGY_CLIENT_SECRET"] = "test-secret"
os.environ["SCHEDULER_ENABLED"] = "false"

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
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def auth_headers(db: Session) -> dict[str, str]:
    from app.core.security import create_access_token, hash_password
    from app.db.models import User

    user = User(email="dono@exemplo.com", password_hash=hash_password("senha-qualquer-123"))
    db.add(user)
    db.commit()
    return {"Authorization": f"Bearer {create_access_token(str(user.id))}"}
