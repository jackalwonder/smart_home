from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_ENV_FILE = Path(__file__).resolve().parents[4] / ".env"
BACKEND_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(ROOT_ENV_FILE), str(BACKEND_ENV_FILE)),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "local"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    database_url: str = "postgresql+psycopg://smart_home:smart_home@localhost:5432/smart_home"
    redis_url: str = "redis://localhost:6379/0"
    connection_encryption_secret: str = "smart-home-local-secret"
    home_assistant_bootstrap_enabled: bool = False
    home_assistant_bootstrap_url: str = "http://homeassistant:8123"
    home_assistant_bootstrap_access_token: str | None = None
    home_assistant_bootstrap_connection_mode: str = "TOKEN"
    capability_energy_enabled: bool = True
    capability_editor_enabled: bool = True
    capability_music_enabled: bool = True
    access_token_secret: str = "smart-home-local-access-token-secret"
    access_token_issuer: str = "smart-home-backend"
    access_token_audience: str = "smart-home-web-app"
    access_token_ttl_seconds: int = 86400
    access_token_leeway_seconds: int = 0
    weather_base_url: str = "https://api.open-meteo.com/v1/forecast"
    weather_latitude: float = 31.2304
    weather_longitude: float = 121.4737


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
