from __future__ import annotations

from datetime import datetime, timezone
from functools import lru_cache
from uuid import uuid4

from src.app.containers import (
    auth_container,
    backup_container,
    catalog_container,
    editor_container,
    energy_container,
    realtime_container,
    settings_container,
)
from src.infrastructure.capabilities.impl.DbCapabilityProvider import DbCapabilityProvider
from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories.base.auth.HomeAuthConfigRepositoryImpl import (
    HomeAuthConfigRepositoryImpl,
)
from src.infrastructure.db.repositories.base.auth.PinLockRepositoryImpl import (
    PinLockRepositoryImpl,
)
from src.infrastructure.db.repositories.base.auth.PinSessionRepositoryImpl import (
    PinSessionRepositoryImpl,
)
from src.infrastructure.db.repositories.base.auth.TerminalBootstrapTokenRepositoryImpl import (
    TerminalBootstrapTokenRepositoryImpl,
)
from src.infrastructure.db.repositories.base.auth.TerminalPairingCodeRepositoryImpl import (
    TerminalPairingCodeRepositoryImpl,
)
from src.infrastructure.db.repositories.base.backups.BackupRepositoryImpl import (
    BackupRepositoryImpl,
)
from src.infrastructure.db.repositories.base.backups.BackupRestoreRepositoryImpl import (
    BackupRestoreRepositoryImpl,
)
from src.infrastructure.db.repositories.base.control.DeviceControlRequestRepositoryImpl import (
    DeviceControlRequestRepositoryImpl,
)
from src.infrastructure.db.repositories.base.control.DeviceControlTransitionRepositoryImpl import (
    DeviceControlTransitionRepositoryImpl,
)
from src.infrastructure.db.repositories.base.editor.DraftHotspotRepositoryImpl import (
    DraftHotspotRepositoryImpl,
)
from src.infrastructure.db.repositories.base.editor.DraftLayoutRepositoryImpl import (
    DraftLayoutRepositoryImpl,
)
from src.infrastructure.db.repositories.base.editor.DraftLeaseRepositoryImpl import (
    DraftLeaseRepositoryImpl,
)
from src.infrastructure.db.repositories.base.devices.DeviceControlSchemaRepositoryImpl import (
    DeviceControlSchemaRepositoryImpl,
)
from src.infrastructure.db.repositories.base.devices.DeviceCatalogCommandRepositoryImpl import (
    DeviceCatalogCommandRepositoryImpl,
)
from src.infrastructure.db.repositories.base.devices.DeviceRepositoryImpl import (
    DeviceRepositoryImpl,
)
from src.infrastructure.db.repositories.base.devices.DeviceRuntimeStateRepositoryImpl import (
    DeviceRuntimeStateRepositoryImpl,
)
from src.infrastructure.db.repositories.base.energy.EnergyAccountRepositoryImpl import (
    EnergyAccountRepositoryImpl,
)
from src.infrastructure.db.repositories.base.energy.EnergySnapshotRepositoryImpl import (
    EnergySnapshotRepositoryImpl,
)
from src.infrastructure.db.repositories.base.media.MediaBindingRepositoryImpl import (
    MediaBindingRepositoryImpl,
)
from src.infrastructure.db.repositories.base.page_assets.PageAssetRepositoryImpl import (
    PageAssetRepositoryImpl,
)
from src.infrastructure.db.repositories.base.realtime.WsEventOutboxRepositoryImpl import (
    WsEventOutboxRepositoryImpl,
)
from src.infrastructure.db.repositories.base.realtime.HaRealtimeSyncRepositoryImpl import (
    HaRealtimeSyncRepositoryImpl,
)
from src.infrastructure.db.repositories.base.realtime.TerminalPresenceRepositoryImpl import (
    TerminalPresenceRepositoryImpl,
)
from src.infrastructure.db.repositories.base.settings.FavoriteDevicesRepositoryImpl import (
    FavoriteDevicesRepositoryImpl,
)
from src.infrastructure.db.repositories.base.settings.FunctionSettingsRepositoryImpl import (
    FunctionSettingsRepositoryImpl,
)
from src.infrastructure.db.repositories.base.settings.LayoutHotspotRepositoryImpl import (
    LayoutHotspotRepositoryImpl,
)
from src.infrastructure.db.repositories.base.settings.LayoutVersionRepositoryImpl import (
    LayoutVersionRepositoryImpl,
)
from src.infrastructure.db.repositories.base.settings.PageSettingsRepositoryImpl import (
    PageSettingsRepositoryImpl,
)
from src.infrastructure.db.repositories.base.settings.SettingsVersionRepositoryImpl import (
    SettingsVersionRepositoryImpl,
)
from src.infrastructure.db.repositories.base.system.SystemConnectionRepositoryImpl import (
    SystemConnectionRepositoryImpl,
)
from src.infrastructure.db.repositories.base.system.HaEntitySyncRepositoryImpl import (
    HaEntitySyncRepositoryImpl,
)
from src.infrastructure.db.repositories.query.auth.AuthSessionQueryRepositoryImpl import (
    AuthSessionQueryRepositoryImpl,
)
from src.infrastructure.db.repositories.query.control.DeviceControlQueryRepositoryImpl import (
    DeviceControlQueryRepositoryImpl,
)
from src.infrastructure.db.repositories.query.editor.EditorDraftQueryRepositoryImpl import (
    EditorDraftQueryRepositoryImpl,
)
from src.infrastructure.db.repositories.query.editor.EditorLeaseQueryRepositoryImpl import (
    EditorLeaseQueryRepositoryImpl,
)
from src.infrastructure.db.repositories.query.overview.HomeOverviewQueryRepositoryImpl import (
    HomeOverviewQueryRepositoryImpl,
)
from src.infrastructure.db.repositories.query.overview.DeviceCatalogQueryRepositoryImpl import (
    DeviceCatalogQueryRepositoryImpl,
)
from src.infrastructure.db.repositories.query.settings.FavoritesQueryRepositoryImpl import (
    FavoritesQueryRepositoryImpl,
)
from src.infrastructure.db.repositories.query.settings.SettingsSnapshotQueryRepositoryImpl import (
    SettingsSnapshotQueryRepositoryImpl,
)
from src.infrastructure.db.unit_of_work.PostgresUnitOfWork import PostgresUnitOfWork
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
from src.modules.auth.services.command.PinVerificationService import (
    PinVerificationService,
)
from src.modules.auth.services.command.BootstrapTokenService import BootstrapTokenService
from src.modules.auth.services.command.TerminalPairingCodeService import (
    TerminalPairingCodeService,
)
from src.modules.backups.services.BackupRestoreService import BackupRestoreService
from src.modules.backups.services.BackupService import BackupService
from src.modules.auth.services.guard.ManagementPinGuard import ManagementPinGuard
from src.modules.auth.services.query.AccessTokenResolver import (
    AccessTokenResolver,
)
from src.modules.auth.services.query.BootstrapTokenResolver import (
    BootstrapTokenResolver,
)
from src.modules.auth.services.query.RequestContextService import RequestContextService
from src.modules.auth.services.query.SessionQueryService import SessionQueryService
from src.modules.device_control.services.command.DeviceControlCommandService import (
    DeviceControlCommandService,
)
from src.modules.device_control.services.query.DeviceControlResultQueryService import (
    DeviceControlResultQueryService,
)
from src.modules.editor.services.EditorDraftService import EditorDraftService
from src.modules.editor.services.EditorPublishService import EditorPublishService
from src.modules.editor.services.EditorSessionService import EditorSessionService
from src.modules.energy.services.EnergyAutoRefreshService import EnergyAutoRefreshService
from src.modules.energy.services.EnergyBindingService import EnergyBindingService
from src.modules.energy.services.EnergyRefreshCoordinator import EnergyRefreshCoordinator
from src.modules.energy.services.EnergyService import EnergyService
from src.modules.energy.services.EnergyUpstreamReader import EnergyUpstreamReader
from src.modules.home_overview.services.query.HomeOverviewQueryService import (
    HomeOverviewQueryService,
)
from src.modules.home_overview.services.DeviceCatalogService import DeviceCatalogService
from src.modules.media.services.MediaService import MediaService
from src.modules.page_assets.services.FloorplanAssetService import FloorplanAssetService
from src.modules.realtime.RealtimeService import RealtimeService
from src.modules.settings.services.command.SettingsSaveService import SettingsSaveService
from src.modules.settings.services.query.FavoritesQueryService import FavoritesQueryService
from src.modules.settings.services.query.SgccLoginQrCodeService import (
    SgccLoginQrCodeService,
)
from src.modules.settings.services.query.SgccRuntimeControlService import SgccContainerRestarter
from src.modules.settings.services.query.SettingsQueryService import SettingsQueryService
from src.modules.system_connections.services.HaEntitySyncService import HaEntitySyncService
from src.modules.system_connections.services.HaRealtimeSyncService import HaRealtimeSyncService
from src.modules.system_connections.services.SystemConnectionService import (
    SystemConnectionService,
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
def get_weather_provider() -> OpenMeteoWeatherProvider:
    return OpenMeteoWeatherProvider(
        get_settings(),
        get_clock(),
        get_ha_connection_gateway(),
    )


@lru_cache(maxsize=1)
def get_connection_secret_cipher() -> FernetConnectionSecretCipher:
    return FernetConnectionSecretCipher(get_settings().connection_encryption_secret)


@lru_cache(maxsize=1)
def get_home_assistant_bootstrap_provider() -> SettingsHomeAssistantBootstrapProvider:
    return SettingsHomeAssistantBootstrapProvider(get_settings())


@lru_cache(maxsize=1)
def get_ha_control_gateway() -> HomeAssistantControlGateway:
    return HomeAssistantControlGateway(
        get_system_connection_repository(),
        get_connection_secret_cipher(),
        get_home_assistant_bootstrap_provider(),
    )


@lru_cache(maxsize=1)
def get_ha_connection_gateway() -> HomeAssistantConnectionGateway:
    return HomeAssistantConnectionGateway(
        get_system_connection_repository(),
        get_connection_secret_cipher(),
        get_home_assistant_bootstrap_provider(),
    )


@lru_cache(maxsize=1)
def get_auth_session_query_repository() -> AuthSessionQueryRepositoryImpl:
    return AuthSessionQueryRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_home_auth_config_repository() -> HomeAuthConfigRepositoryImpl:
    return HomeAuthConfigRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_pin_session_repository() -> PinSessionRepositoryImpl:
    return PinSessionRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_terminal_bootstrap_token_repository() -> TerminalBootstrapTokenRepositoryImpl:
    return TerminalBootstrapTokenRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_terminal_pairing_code_repository() -> TerminalPairingCodeRepositoryImpl:
    return TerminalPairingCodeRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_pin_lock_repository() -> PinLockRepositoryImpl:
    return PinLockRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_home_overview_query_repository() -> HomeOverviewQueryRepositoryImpl:
    return HomeOverviewQueryRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_device_catalog_query_repository() -> DeviceCatalogQueryRepositoryImpl:
    return DeviceCatalogQueryRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_settings_snapshot_query_repository() -> SettingsSnapshotQueryRepositoryImpl:
    return SettingsSnapshotQueryRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_favorites_query_repository() -> FavoritesQueryRepositoryImpl:
    return FavoritesQueryRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_editor_draft_query_repository() -> EditorDraftQueryRepositoryImpl:
    return EditorDraftQueryRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_editor_lease_query_repository() -> EditorLeaseQueryRepositoryImpl:
    return EditorLeaseQueryRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_device_control_query_repository() -> DeviceControlQueryRepositoryImpl:
    return DeviceControlQueryRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_device_repository() -> DeviceRepositoryImpl:
    return DeviceRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_device_catalog_command_repository() -> DeviceCatalogCommandRepositoryImpl:
    return DeviceCatalogCommandRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_device_runtime_state_repository() -> DeviceRuntimeStateRepositoryImpl:
    return DeviceRuntimeStateRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_device_control_schema_repository() -> DeviceControlSchemaRepositoryImpl:
    return DeviceControlSchemaRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_device_control_request_repository() -> DeviceControlRequestRepositoryImpl:
    return DeviceControlRequestRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_device_control_transition_repository() -> DeviceControlTransitionRepositoryImpl:
    return DeviceControlTransitionRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_ws_event_outbox_repository() -> WsEventOutboxRepositoryImpl:
    return WsEventOutboxRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_ha_realtime_sync_repository() -> HaRealtimeSyncRepositoryImpl:
    return HaRealtimeSyncRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_terminal_presence_repository() -> TerminalPresenceRepositoryImpl:
    return TerminalPresenceRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_settings_version_repository() -> SettingsVersionRepositoryImpl:
    return SettingsVersionRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_favorite_devices_repository() -> FavoriteDevicesRepositoryImpl:
    return FavoriteDevicesRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_page_settings_repository() -> PageSettingsRepositoryImpl:
    return PageSettingsRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_function_settings_repository() -> FunctionSettingsRepositoryImpl:
    return FunctionSettingsRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_layout_version_repository() -> LayoutVersionRepositoryImpl:
    return LayoutVersionRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_layout_hotspot_repository() -> LayoutHotspotRepositoryImpl:
    return LayoutHotspotRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_draft_layout_repository() -> DraftLayoutRepositoryImpl:
    return DraftLayoutRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_draft_hotspot_repository() -> DraftHotspotRepositoryImpl:
    return DraftHotspotRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_draft_lease_repository() -> DraftLeaseRepositoryImpl:
    return DraftLeaseRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_system_connection_repository() -> SystemConnectionRepositoryImpl:
    return SystemConnectionRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_ha_entity_sync_repository() -> HaEntitySyncRepositoryImpl:
    return HaEntitySyncRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_energy_account_repository() -> EnergyAccountRepositoryImpl:
    return EnergyAccountRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_energy_snapshot_repository() -> EnergySnapshotRepositoryImpl:
    return EnergySnapshotRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_media_binding_repository() -> MediaBindingRepositoryImpl:
    return MediaBindingRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_backup_repository() -> BackupRepositoryImpl:
    return BackupRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_backup_restore_repository() -> BackupRestoreRepositoryImpl:
    return BackupRestoreRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_page_asset_repository() -> PageAssetRepositoryImpl:
    return PageAssetRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_asset_storage() -> FileSystemAssetStorage:
    return FileSystemAssetStorage()


@lru_cache(maxsize=1)
def get_unit_of_work() -> PostgresUnitOfWork:
    return PostgresUnitOfWork(get_database())


@lru_cache(maxsize=1)
def get_management_pin_guard() -> ManagementPinGuard:
    return auth_container.get_management_pin_guard()


@lru_cache(maxsize=1)
def get_access_token_resolver() -> AccessTokenResolver:
    return auth_container.get_access_token_resolver()


@lru_cache(maxsize=1)
def get_bootstrap_token_resolver() -> BootstrapTokenResolver:
    return auth_container.get_bootstrap_token_resolver()


def get_request_context_service() -> RequestContextService:
    return auth_container.get_request_context_service()


@lru_cache(maxsize=1)
def get_session_query_service() -> SessionQueryService:
    return auth_container.get_session_query_service()


@lru_cache(maxsize=1)
def get_pin_verification_service() -> PinVerificationService:
    return auth_container.get_pin_verification_service()


@lru_cache(maxsize=1)
def get_bootstrap_token_service() -> BootstrapTokenService:
    return auth_container.get_bootstrap_token_service()


@lru_cache(maxsize=1)
def get_terminal_pairing_code_service() -> TerminalPairingCodeService:
    return auth_container.get_terminal_pairing_code_service()


@lru_cache(maxsize=1)
def get_home_overview_query_service() -> HomeOverviewQueryService:
    return catalog_container.get_home_overview_query_service()


@lru_cache(maxsize=1)
def get_device_catalog_service() -> DeviceCatalogService:
    return catalog_container.get_device_catalog_service()


@lru_cache(maxsize=1)
def get_ha_entity_sync_service() -> HaEntitySyncService:
    return realtime_container.get_ha_entity_sync_service()


@lru_cache(maxsize=1)
def get_ha_realtime_sync_service() -> HaRealtimeSyncService:
    return realtime_container.get_ha_realtime_sync_service()


@lru_cache(maxsize=1)
def get_settings_query_service() -> SettingsQueryService:
    return settings_container.get_settings_query_service()


@lru_cache(maxsize=1)
def get_favorites_query_service() -> FavoritesQueryService:
    return settings_container.get_favorites_query_service()


@lru_cache(maxsize=1)
def get_sgcc_login_qr_code_service() -> SgccLoginQrCodeService:
    return settings_container.get_sgcc_login_qr_code_service()


@lru_cache(maxsize=1)
def get_sgcc_container_restarter() -> SgccContainerRestarter:
    return settings_container.get_sgcc_container_restarter()


@lru_cache(maxsize=1)
def get_settings_save_service() -> SettingsSaveService:
    return settings_container.get_settings_save_service()


@lru_cache(maxsize=1)
def get_editor_session_service() -> EditorSessionService:
    return editor_container.get_editor_session_service()


@lru_cache(maxsize=1)
def get_editor_draft_service() -> EditorDraftService:
    return editor_container.get_editor_draft_service()


@lru_cache(maxsize=1)
def get_editor_publish_service() -> EditorPublishService:
    return editor_container.get_editor_publish_service()


@lru_cache(maxsize=1)
def get_device_control_result_query_service() -> DeviceControlResultQueryService:
    return realtime_container.get_device_control_result_query_service()


@lru_cache(maxsize=1)
def get_realtime_service() -> RealtimeService:
    return realtime_container.get_realtime_service()


@lru_cache(maxsize=1)
def get_device_control_command_service() -> DeviceControlCommandService:
    return realtime_container.get_device_control_command_service()


@lru_cache(maxsize=1)
def get_system_connection_service() -> SystemConnectionService:
    return realtime_container.get_system_connection_service()


@lru_cache(maxsize=1)
def get_energy_upstream_reader() -> EnergyUpstreamReader:
    return energy_container.get_energy_upstream_reader()


@lru_cache(maxsize=1)
def get_energy_binding_service() -> EnergyBindingService:
    return energy_container.get_energy_binding_service()


@lru_cache(maxsize=1)
def get_energy_refresh_coordinator() -> EnergyRefreshCoordinator:
    return energy_container.get_energy_refresh_coordinator()


@lru_cache(maxsize=1)
def get_energy_service() -> EnergyService:
    return energy_container.get_energy_service()


@lru_cache(maxsize=1)
def get_energy_auto_refresh_service() -> EnergyAutoRefreshService:
    return energy_container.get_energy_auto_refresh_service()


@lru_cache(maxsize=1)
def get_media_service() -> MediaService:
    return backup_container.get_media_service()


@lru_cache(maxsize=1)
def get_floorplan_asset_service() -> FloorplanAssetService:
    return backup_container.get_floorplan_asset_service()


@lru_cache(maxsize=1)
def get_backup_service() -> BackupService:
    return backup_container.get_backup_service()


@lru_cache(maxsize=1)
def get_backup_restore_service() -> BackupRestoreService:
    return backup_container.get_backup_restore_service()
