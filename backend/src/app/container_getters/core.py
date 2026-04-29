from __future__ import annotations

from src.app.container_getters._shared import resolve
from src.infrastructure.capabilities.impl.DbCapabilityProvider import DbCapabilityProvider
from src.infrastructure.db.connection.Database import Database
from src.infrastructure.ha.impl.HomeAssistantConnectionGateway import HomeAssistantConnectionGateway
from src.infrastructure.ha.impl.HomeAssistantControlGateway import HomeAssistantControlGateway
from src.infrastructure.ha.impl.SettingsHomeAssistantBootstrapProvider import (
    SettingsHomeAssistantBootstrapProvider,
)
from src.infrastructure.security.impl.FernetConnectionSecretCipher import (
    FernetConnectionSecretCipher,
)
from src.infrastructure.storage.FileSystemAssetStorage import FileSystemAssetStorage
from src.infrastructure.weather.impl.OpenMeteoWeatherProvider import OpenMeteoWeatherProvider
from src.shared.config.Settings import Settings
from src.shared.kernel.implementations import (
    SystemClock,
    TimestampVersionTokenGenerator,
    UuidEventIdGenerator,
    UuidIdGenerator,
)


def get_settings() -> Settings:
    return resolve(Settings)


def get_database() -> Database:
    return resolve(Database)


def get_clock() -> SystemClock:
    return resolve(SystemClock)


def get_event_id_generator() -> UuidEventIdGenerator:
    return resolve(UuidEventIdGenerator)


def get_id_generator() -> UuidIdGenerator:
    return resolve(UuidIdGenerator)


def get_version_token_generator() -> TimestampVersionTokenGenerator:
    return resolve(TimestampVersionTokenGenerator)


def get_capability_provider() -> DbCapabilityProvider:
    return resolve(DbCapabilityProvider)


def get_weather_provider() -> OpenMeteoWeatherProvider:
    return resolve(OpenMeteoWeatherProvider)


def get_connection_secret_cipher() -> FernetConnectionSecretCipher:
    return resolve(FernetConnectionSecretCipher)


def get_home_assistant_bootstrap_provider() -> SettingsHomeAssistantBootstrapProvider:
    return resolve(SettingsHomeAssistantBootstrapProvider)


def get_ha_control_gateway() -> HomeAssistantControlGateway:
    return resolve(HomeAssistantControlGateway)


def get_ha_connection_gateway() -> HomeAssistantConnectionGateway:
    return resolve(HomeAssistantConnectionGateway)


def get_asset_storage() -> FileSystemAssetStorage:
    return resolve(FileSystemAssetStorage)


__all__ = [
    "get_asset_storage",
    "get_capability_provider",
    "get_clock",
    "get_connection_secret_cipher",
    "get_database",
    "get_event_id_generator",
    "get_ha_connection_gateway",
    "get_ha_control_gateway",
    "get_home_assistant_bootstrap_provider",
    "get_id_generator",
    "get_settings",
    "get_version_token_generator",
    "get_weather_provider",
]

