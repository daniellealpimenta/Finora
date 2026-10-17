from functools import lru_cache
from pathlib import Path

from platformdirs import user_data_dir
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DATA_DIR = Path(user_data_dir("ManagerFinance", appauthor=False))


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    environment: str = "development"
    # Fora da pasta do projeto (que pode estar sincronizada com OneDrive/iCloud):
    # Windows: %LOCALAPPDATA%\ManagerFinance; macOS: ~/Library/Application Support/ManagerFinance
    database_url: str = f"sqlite:///{(_DATA_DIR / 'managerfinance.db').as_posix()}"

    # Auth
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 30

    # Chave Fernet (base64, 32 bytes) para criptografar campos sensíveis no banco
    field_encryption_key: str = ""

    # CORS: origens separadas por vírgula
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Pluggy
    pluggy_base_url: str = "https://api.pluggy.ai"
    pluggy_client_id: str = ""
    pluggy_client_secret: str = ""

    # Sync periódico (sem webhook, já que tudo roda local)
    scheduler_enabled: bool = True
    sync_interval_hours: float = 6

    @field_validator("database_url")
    @classmethod
    def _path_to_sqlite_url(cls, value: str) -> str:
        """Aceita um caminho de arquivo puro (ex.: C:\\dados\\mf.db) e converte para URL SQLite."""
        if "://" in value:
            return value
        return f"sqlite:///{Path(value).expanduser().as_posix()}"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
