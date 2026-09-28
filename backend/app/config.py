import os
from functools import lru_cache
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


def _env_file() -> str:
    """ENV_FILE (если задан), иначе первый существующий: .env.local → .env → .env.vps (в папке backend/)."""
    explicit = os.getenv("ENV_FILE")
    if explicit:
        return explicit
    for name in (".env.local", ".env", ".env.vps"):
        path = BACKEND_DIR / name
        if path.is_file():
            return str(path)
    return str(BACKEND_DIR / ".env")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_env_file(),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "local"
    app_debug: bool = True

    database_url: str

    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30
    jwt_refresh_token_expire_days: int = 30

    mail_host: str = "smtp.gmail.com"
    mail_port: int = 587
    mail_username: str
    mail_password: str
    mail_from_address: str
    mail_from_name: str = "Business Analytics Platform"
    mail_use_tls: bool = True

    cors_origins: str = "http://localhost"

    frontend_base_url: str = "http://localhost:8000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
