from __future__ import annotations

from datetime import datetime, timezone
from functools import lru_cache
from uuid import uuid4

from src.infrastructure.capabilities.impl.DbCapabilityProvider import DbCapabilityProvider
from src.infrastructure.db.connection.Database import Database
from src.infrastructure.ha.impl.HomeAssistantConnectionGateway import (
    HomeAssistantConnectionGateway,
)
from src.infrastructure.ha.impl.HomeAssistantControlGateway import (
    HomeAssistantControlGateway,
)
from src.infrastructure.ha.impl.SettingsHomeAssistantBootstrapProvider import (
    SettingsHomeAssistantBootstrapProvider,
)
from src.infrastructure.security.impl.FernetConnectionSecretCipher import (
    FernetConnectionSecretCipher,
)
from src.infrastructure.storage.FileSystemAssetStorage import FileSystemAssetStorage
from src.infrastructure.weather.impl.OpenMeteoWeatherProvider import (
    OpenMeteoWeatherProvider,
)
from src.shared.config.Settings import get_settings


class SystemClock:
    def now(self) -> datetime:
        return datetime.now(timezone.utc)


class UuidEventIdGenerator:
    def next_event_id(self) -> str:
        return str(uuid4())


class UuidIdGenerator:
    def next_id(self) -> str:
        return str(uuid4())


class TimestampVersionTokenGenerator:
    def __init__(self, clock: SystemClock) -> None:
        self._clock = clock

    def _token(self, prefix: str) -> str:
        return f"{prefix}_{self._clock.now().strftime('%Y%m%d%H%M%S%f')}"

    def next_settings_version(self) -> str:
        return self._token("sv")

    def next_layout_version(self) -> str:
        return self._token("lv")

    def next_draft_version(self) -> str:
        return self._token("dv")


@lru_cache(maxsize=1)
def get_database() -> Database:
    return Database(get_settings().database_url)


@lru_cache(maxsize=1)
def get_clock() -> SystemClock:
    return SystemClock()


@lru_cache(maxsize=1)
def get_event_id_generator() -> UuidEventIdGenerator:
    return UuidEventIdGenerator()


@lru_cache(maxsize=1)
def get_id_generator() -> UuidIdGenerator:
    return UuidIdGenerator()


@lru_cache(maxsize=1)
def get_version_token_generator() -> TimestampVersionTokenGenerator:
    return TimestampVersionTokenGenerator(get_clock())


@lru_cache(maxsize=1)
def get_capability_provider() -> DbCapabilityProvider:
    return DbCapabilityProvider(get_database(), get_settings())


@lru_cache(maxsize=1)
def get_connection_secret_cipher() -> FernetConnectionSecretCipher:
    return FernetConnectionSecretCipher(get_settings().connection_encryption_secret)


@lru_cache(maxsize=1)
def get_home_assistant_bootstrap_provider() -> SettingsHomeAssistantBootstrapProvider:
    return SettingsHomeAssistantBootstrapProvider(get_settings())


@lru_cache(maxsize=1)
def get_ha_control_gateway() -> HomeAssistantControlGateway:
    from src.app.containers import repositories_container

    return HomeAssistantControlGateway(
        repositories_container.get_system_connection_repository(),
        get_connection_secret_cipher(),
        get_home_assistant_bootstrap_provider(),
    )


@lru_cache(maxsize=1)
def get_ha_connection_gateway() -> HomeAssistantConnectionGateway:
    from src.app.containers import repositories_container

    return HomeAssistantConnectionGateway(
        repositories_container.get_system_connection_repository(),
        get_connection_secret_cipher(),
        get_home_assistant_bootstrap_provider(),
    )


@lru_cache(maxsize=1)
def get_weather_provider() -> OpenMeteoWeatherProvider:
    return OpenMeteoWeatherProvider(
        get_settings(),
        get_clock(),
        get_ha_connection_gateway(),
    )


@lru_cache(maxsize=1)
def get_asset_storage() -> FileSystemAssetStorage:
    return FileSystemAssetStorage()
