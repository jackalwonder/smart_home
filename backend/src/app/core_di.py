from __future__ import annotations

from injector import Module, provider, singleton

from src.app.containers.core_container import (
    SystemClock,
    TimestampVersionTokenGenerator,
    UuidEventIdGenerator,
    UuidIdGenerator,
)
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
from src.shared.config.Settings import Settings, get_settings


class CoreModule(Module):
    @provider
    @singleton
    def provide_settings(self) -> Settings:
        return get_settings()

    @provider
    @singleton
    def provide_database(self, settings: Settings) -> Database:
        return Database(settings.database_url)

    @provider
    @singleton
    def provide_clock(self) -> SystemClock:
        return SystemClock()

    @provider
    @singleton
    def provide_event_id_generator(self) -> UuidEventIdGenerator:
        return UuidEventIdGenerator()

    @provider
    @singleton
    def provide_id_generator(self) -> UuidIdGenerator:
        return UuidIdGenerator()

    @provider
    @singleton
    def provide_version_token_generator(
        self, clock: SystemClock
    ) -> TimestampVersionTokenGenerator:
        return TimestampVersionTokenGenerator(clock)

    @provider
    @singleton
    def provide_capability_provider(
        self, db: Database, settings: Settings
    ) -> DbCapabilityProvider:
        return DbCapabilityProvider(db, settings)

    @provider
    @singleton
    def provide_connection_secret_cipher(
        self, settings: Settings
    ) -> FernetConnectionSecretCipher:
        return FernetConnectionSecretCipher(settings.connection_encryption_secret)

    @provider
    @singleton
    def provide_home_assistant_bootstrap_provider(
        self, settings: Settings
    ) -> SettingsHomeAssistantBootstrapProvider:
        return SettingsHomeAssistantBootstrapProvider(settings)

    @provider
    @singleton
    def provide_ha_control_gateway(
        self,
        cipher: FernetConnectionSecretCipher,
        ha_bootstrap: SettingsHomeAssistantBootstrapProvider,
    ) -> HomeAssistantControlGateway:
        from src.app.container import get_system_connection_repository

        return HomeAssistantControlGateway(
            get_system_connection_repository(),
            cipher,
            ha_bootstrap,
        )

    @provider
    @singleton
    def provide_ha_connection_gateway(
        self,
        cipher: FernetConnectionSecretCipher,
        ha_bootstrap: SettingsHomeAssistantBootstrapProvider,
    ) -> HomeAssistantConnectionGateway:
        from src.app.container import get_system_connection_repository

        return HomeAssistantConnectionGateway(
            get_system_connection_repository(),
            cipher,
            ha_bootstrap,
        )

    @provider
    @singleton
    def provide_weather_provider(
        self,
        settings: Settings,
        clock: SystemClock,
        ha_gateway: HomeAssistantConnectionGateway,
    ) -> OpenMeteoWeatherProvider:
        return OpenMeteoWeatherProvider(settings, clock, ha_gateway)

    @provider
    @singleton
    def provide_asset_storage(self) -> FileSystemAssetStorage:
        return FileSystemAssetStorage()
