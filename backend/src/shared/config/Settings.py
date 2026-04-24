from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_ENV_FILE = Path(__file__).resolve().parents[4] / ".env"
BACKEND_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"
DEFAULT_SGCC_QR_CODE_FILE = (
    Path(__file__).resolve().parents[4]
    / "deploy"
    / "sgcc_electricity"
    / "login_qr_code.png"
)
DEFAULT_SGCC_CACHE_FILE = (
    Path(__file__).resolve().parents[4]
    / "deploy"
    / "sgcc_electricity"
    / "sgcc_cache.json"
)

LOCAL_APP_ENVS = {"local", "test", "dev", "development"}
DEV_BYPASS_ALLOWED_ENVS = LOCAL_APP_ENVS | {"docker"}
DEFAULT_CONNECTION_ENCRYPTION_SECRET = "smart-home-local-secret"
DEFAULT_ACCESS_TOKEN_SECRET = "smart-home-local-access-token-secret"
DEFAULT_BOOTSTRAP_TOKEN_SECRET = "smart-home-local-bootstrap-token-secret"
UNSAFE_SECRET_VALUES = {
    "",
    "change-this-in-real-env",
    "change-this-to-a-random-secret",
    DEFAULT_CONNECTION_ENCRYPTION_SECRET,
    DEFAULT_ACCESS_TOKEN_SECRET,
    DEFAULT_BOOTSTRAP_TOKEN_SECRET,
}
MIN_NON_LOCAL_SECRET_LENGTH = 32
SECRET_ENV_VARS = {
    "connection_encryption_secret": "CONNECTION_ENCRYPTION_SECRET",
    "access_token_secret": "ACCESS_TOKEN_SECRET",
    "bootstrap_token_secret": "BOOTSTRAP_TOKEN_SECRET",
}


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
    connection_encryption_secret: str = DEFAULT_CONNECTION_ENCRYPTION_SECRET
    home_assistant_bootstrap_enabled: bool = False
    home_assistant_bootstrap_url: str = "http://homeassistant:8123"
    home_assistant_bootstrap_access_token: str | None = None
    home_assistant_bootstrap_connection_mode: str = "TOKEN"
    capability_energy_enabled: bool = True
    capability_editor_enabled: bool = True
    capability_music_enabled: bool = True
    access_token_secret: str = DEFAULT_ACCESS_TOKEN_SECRET
    access_token_issuer: str = "smart-home-backend"
    access_token_audience: str = "smart-home-web-app"
    access_token_ttl_seconds: int = 86400
    access_token_leeway_seconds: int = 0
    bootstrap_token_secret: str = DEFAULT_BOOTSTRAP_TOKEN_SECRET
    bootstrap_token_ttl_seconds: int = 2592000
    bootstrap_token_leeway_seconds: int = 0
    dev_bypass_terminal_activation: bool = False
    pairing_code_ttl_seconds: int = 600
    pairing_code_issue_cooldown_seconds: int = 30
    readiness_check_timeout_seconds: float = 3.0
    sgcc_qr_code_file: str = str(DEFAULT_SGCC_QR_CODE_FILE)
    sgcc_cache_file: str = str(DEFAULT_SGCC_CACHE_FILE)
    sgcc_qr_code_ttl_seconds: int = 60
    sgcc_docker_socket_path: str = "/var/run/docker.sock"
    sgcc_docker_container_name: str = "smart-home-sgcc-electricity"
    sgcc_sidecar_base_url: str = "http://sgcc_electricity:8080"
    sgcc_sidecar_timeout_seconds: float = 10.0
    sgcc_sidecar_fallback_enabled: bool = False
    weather_base_url: str = "https://api.open-meteo.com/v1/forecast"
    weather_latitude: float = 31.2304
    weather_longitude: float = 121.4737
    weather_location_label: str | None = None
    weather_home_assistant_entity_id: str | None = None
    energy_auto_refresh_enabled: bool = True
    energy_auto_refresh_hour: int = 7
    energy_auto_refresh_minute: int = 30
    energy_auto_refresh_timezone: str = "Asia/Shanghai"
    energy_upstream_refresh_mode: str = "sgcc_sidecar"
    energy_upstream_ha_domain: str | None = None
    energy_upstream_ha_service: str | None = None
    energy_upstream_ha_entity_id: str | None = None
    energy_upstream_wait_timeout_seconds: int = 900
    energy_upstream_poll_interval_seconds: float = 10.0

    @model_validator(mode="after")
    def validate_non_local_secrets(self) -> "Settings":
        normalized_env = self.app_env.strip().lower()
        if self.dev_bypass_terminal_activation and normalized_env not in DEV_BYPASS_ALLOWED_ENVS:
            raise ValueError(
                "DEV_BYPASS_TERMINAL_ACTIVATION is only allowed in local, dev, test, or docker environments"
            )

        if normalized_env in LOCAL_APP_ENVS:
            return self

        weak_fields = [
            SECRET_ENV_VARS[field_name]
            for field_name in (
                "connection_encryption_secret",
                "access_token_secret",
                "bootstrap_token_secret",
            )
            if _is_unsafe_secret(getattr(self, field_name))
        ]
        if weak_fields:
            raise ValueError(
                "Non-local deployments must configure strong secret values for: "
                + ", ".join(weak_fields)
            )
        return self


def _is_unsafe_secret(value: str) -> bool:
    normalized = value.strip()
    return (
        normalized in UNSAFE_SECRET_VALUES
        or normalized.startswith("change-this")
        or len(normalized) < MIN_NON_LOCAL_SECRET_LENGTH
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
