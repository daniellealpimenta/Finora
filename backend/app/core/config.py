import ipaddress
import re
from functools import lru_cache
from pathlib import Path, PureWindowsPath
from urllib.parse import urlsplit

from platformdirs import user_data_dir
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DATA_DIR = Path(user_data_dir("ManagerFinance", appauthor=False))


class Settings(BaseSettings):
    # O .exe não roda dentro do projeto: lê o .env da pasta de dados. O último arquivo
    # vence, então no modo web o .env do projeto continua mandando.
    model_config = SettingsConfigDict(
        env_file=(_DATA_DIR / ".env", ".env", "../.env"), extra="ignore"
    )

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

    # Assistente: Ollama rodando nesta máquina. Só aceita endereço local (validador abaixo),
    # para nenhum dado financeiro sair do computador, nem com um .env errado.
    llm_base_url: str = "http://127.0.0.1:11434"

    @field_validator("database_url")
    @classmethod
    def _path_to_sqlite_url(cls, value: str) -> str:
        """Aceita um caminho de arquivo puro (ex.: C:\\dados\\mf.db) e converte para URL SQLite."""
        if "://" in value:
            return value
        # Caminho do Windows (C:\\...) vira C:/... em qualquer sistema; no macOS/Linux o Path
        # comum não entende a barra invertida e o deixaria como está.
        if re.match(r"^[A-Za-z]:[\\/]", value):
            return f"sqlite:///{PureWindowsPath(value).as_posix()}"
        return f"sqlite:///{Path(value).expanduser().as_posix()}"

    @field_validator("llm_base_url")
    @classmethod
    def _loopback_only(cls, value: str) -> str:
        host = urlsplit(value).hostname or ""
        try:
            local = ipaddress.ip_address(host).is_loopback
        except ValueError:
            local = host == "localhost"
        if not local:
            raise ValueError("llm_base_url precisa apontar para esta máquina (127.0.0.1)")
        return value.rstrip("/")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
