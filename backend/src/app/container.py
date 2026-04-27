from __future__ import annotations

from src.app.injector import get_injector
from src.shared.kernel.implementations import (
    SystemClock,
    TimestampVersionTokenGenerator,
    UuidEventIdGenerator,
    UuidIdGenerator,
)
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

from src.infrastructure.db.repositories.query.auth.AuthSessionQueryRepositoryImpl import (
    AuthSessionQueryRepositoryImpl,
)
from src.infrastructure.db.repositories.query.auth.RequestContextRepositoryImpl import (
    RequestContextRepositoryImpl,
)
from src.infrastructure.db.repositories.base.auth.HomeAuthConfigRepositoryImpl import (
    HomeAuthConfigRepositoryImpl,
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
from src.infrastructure.db.repositories.base.auth.PinLockRepositoryImpl import PinLockRepositoryImpl

from src.infrastructure.db.repositories.query.overview.HomeOverviewQueryRepositoryImpl import (
    HomeOverviewQueryRepositoryImpl,
)
from src.infrastructure.db.repositories.query.overview.DeviceCatalogQueryRepositoryImpl import (
    DeviceCatalogQueryRepositoryImpl,
)
from src.infrastructure.db.repositories.base.devices.DeviceRepositoryImpl import DeviceRepositoryImpl
from src.infrastructure.db.repositories.base.devices.DeviceCatalogCommandRepositoryImpl import (
    DeviceCatalogCommandRepositoryImpl,
)
from src.infrastructure.db.repositories.base.devices.DeviceRuntimeStateRepositoryImpl import (
    DeviceRuntimeStateRepositoryImpl,
)
from src.infrastructure.db.repositories.base.devices.DeviceControlSchemaRepositoryImpl import (
    DeviceControlSchemaRepositoryImpl,
)
from src.infrastructure.db.repositories.query.settings.SettingsSnapshotQueryRepositoryImpl import (
    SettingsSnapshotQueryRepositoryImpl,
)
from src.infrastructure.db.repositories.query.settings.FavoritesQueryRepositoryImpl import (
    FavoritesQueryRepositoryImpl,
)
from src.infrastructure.db.repositories.query.editor.EditorDraftQueryRepositoryImpl import (
    EditorDraftQueryRepositoryImpl,
)
from src.infrastructure.db.repositories.query.editor.EditorLeaseQueryRepositoryImpl import (
    EditorLeaseQueryRepositoryImpl,
)
from src.infrastructure.db.repositories.query.control.DeviceControlQueryRepositoryImpl import (
    DeviceControlQueryRepositoryImpl,
)
from src.infrastructure.db.repositories.base.control.DeviceControlRequestRepositoryImpl import (
    DeviceControlRequestRepositoryImpl,
)
from src.infrastructure.db.repositories.base.control.DeviceControlTransitionRepositoryImpl import (
    DeviceControlTransitionRepositoryImpl,
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
from src.infrastructure.db.repositories.base.settings.SettingsVersionRepositoryImpl import (
    SettingsVersionRepositoryImpl,
)
from src.infrastructure.db.repositories.base.settings.FavoriteDevicesRepositoryImpl import (
    FavoriteDevicesRepositoryImpl,
)
from src.infrastructure.db.repositories.base.settings.PageSettingsRepositoryImpl import (
    PageSettingsRepositoryImpl,
)
from src.infrastructure.db.repositories.base.settings.FunctionSettingsRepositoryImpl import (
    FunctionSettingsRepositoryImpl,
)
from src.infrastructure.db.repositories.base.settings.LayoutVersionRepositoryImpl import (
    LayoutVersionRepositoryImpl,
)
from src.infrastructure.db.repositories.base.settings.LayoutHotspotRepositoryImpl import (
    LayoutHotspotRepositoryImpl,
)
from src.infrastructure.db.repositories.base.editor.DraftLayoutRepositoryImpl import (
    DraftLayoutRepositoryImpl,
)
from src.infrastructure.db.repositories.base.editor.DraftHotspotRepositoryImpl import (
    DraftHotspotRepositoryImpl,
)
from src.infrastructure.db.repositories.base.editor.DraftLeaseRepositoryImpl import (
    DraftLeaseRepositoryImpl,
)
from src.infrastructure.db.repositories.base.system.SystemConnectionRepositoryImpl import (
    SystemConnectionRepositoryImpl,
)
from src.infrastructure.db.repositories.base.system.HaEntitySyncRepositoryImpl import (
    HaEntitySyncRepositoryImpl,
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
from src.infrastructure.db.repositories.base.backups.BackupRepositoryImpl import (
    BackupRepositoryImpl,
)
from src.infrastructure.db.repositories.base.backups.BackupRestoreRepositoryImpl import (
    BackupRestoreRepositoryImpl,
)
from src.infrastructure.db.repositories.base.page_assets.PageAssetRepositoryImpl import (
    PageAssetRepositoryImpl,
)
from src.infrastructure.db.unit_of_work.PostgresUnitOfWork import PostgresUnitOfWork

from src.modules.auth.services.guard.ManagementPinGuard import ManagementPinGuard
from src.modules.auth.services.query.AccessTokenResolver import JwtAccessTokenResolver
from src.modules.auth.services.query.BootstrapTokenResolver import JwtBootstrapTokenResolver
from src.modules.auth.services.query.RequestContextService import RequestContextService
from src.modules.auth.services.query.SessionQueryService import SessionQueryService
from src.modules.auth.services.command.PinVerificationService import PinVerificationService
from src.modules.auth.services.command.BootstrapTokenService import BootstrapTokenService
from src.modules.auth.services.command.TerminalPairingCodeService import (
    TerminalPairingCodeService,
)

from src.modules.home_overview.services.query.HomeOverviewQueryService import (
    HomeOverviewQueryService,
)
from src.modules.home_overview.services.DeviceCatalogService import DeviceCatalogService

from src.modules.editor.services.EditorSessionService import EditorSessionService
from src.modules.editor.services.EditorDraftService import EditorDraftService
from src.modules.editor.services.EditorPublishService import EditorPublishService

from src.modules.energy.services.EnergyUpstreamReader import EnergyUpstreamReader
from src.modules.energy.services.EnergyBindingService import EnergyBindingService
from src.modules.energy.services.EnergyRefreshCoordinator import EnergyRefreshCoordinator
from src.modules.energy.services.EnergyService import EnergyService
from src.modules.energy.services.EnergyAutoRefreshService import EnergyAutoRefreshService

from src.modules.settings.services.query.SettingsQueryService import SettingsQueryService
from src.modules.settings.services.query.FavoritesQueryService import FavoritesQueryService
from src.modules.settings.services.query.SgccLoginQrCodeService import SgccLoginQrCodeService
from src.modules.settings.services.query.SgccRuntimeControlService import SgccContainerRestarter
from src.modules.settings.services.command.SettingsSaveService import SettingsSaveService

from src.modules.system_connections.services.HaEntitySyncService import HaEntitySyncService
from src.modules.system_connections.services.HaRealtimeSyncService import HaRealtimeSyncService
from src.modules.device_control.services.query.DeviceControlResultQueryService import (
    DeviceControlResultQueryService,
)
from src.modules.realtime.RealtimeService import RealtimeService
from src.modules.device_control.services.command.DeviceControlCommandService import (
    DeviceControlCommandService,
)
from src.modules.system_connections.services.SystemConnectionService import (
    SystemConnectionService,
)

from src.modules.media.services.MediaService import MediaService
from src.modules.page_assets.services.FloorplanAssetService import FloorplanAssetService
from src.modules.backups.services.BackupService import BackupService
from src.modules.backups.services.BackupRestoreService import BackupRestoreService


_inj = get_injector()


def get_settings() -> Settings:
    return _inj.get(Settings)


def get_database() -> Database:
    return _inj.get(Database)


def get_clock() -> SystemClock:
    return _inj.get(SystemClock)


def get_event_id_generator() -> UuidEventIdGenerator:
    return _inj.get(UuidEventIdGenerator)


def get_id_generator() -> UuidIdGenerator:
    return _inj.get(UuidIdGenerator)


def get_version_token_generator() -> TimestampVersionTokenGenerator:
    return _inj.get(TimestampVersionTokenGenerator)


def get_capability_provider() -> DbCapabilityProvider:
    return _inj.get(DbCapabilityProvider)


def get_weather_provider() -> OpenMeteoWeatherProvider:
    return _inj.get(OpenMeteoWeatherProvider)


def get_connection_secret_cipher() -> FernetConnectionSecretCipher:
    return _inj.get(FernetConnectionSecretCipher)


def get_home_assistant_bootstrap_provider() -> SettingsHomeAssistantBootstrapProvider:
    return _inj.get(SettingsHomeAssistantBootstrapProvider)


def get_ha_control_gateway() -> HomeAssistantControlGateway:
    return _inj.get(HomeAssistantControlGateway)


def get_ha_connection_gateway() -> HomeAssistantConnectionGateway:
    return _inj.get(HomeAssistantConnectionGateway)


def get_asset_storage() -> FileSystemAssetStorage:
    return _inj.get(FileSystemAssetStorage)


def get_auth_session_query_repository() -> AuthSessionQueryRepositoryImpl:
    return _inj.get(AuthSessionQueryRepositoryImpl)


def get_request_context_repository() -> RequestContextRepositoryImpl:
    return _inj.get(RequestContextRepositoryImpl)


def get_home_auth_config_repository() -> HomeAuthConfigRepositoryImpl:
    return _inj.get(HomeAuthConfigRepositoryImpl)


def get_pin_session_repository() -> PinSessionRepositoryImpl:
    return _inj.get(PinSessionRepositoryImpl)


def get_terminal_bootstrap_token_repository() -> TerminalBootstrapTokenRepositoryImpl:
    return _inj.get(TerminalBootstrapTokenRepositoryImpl)


def get_terminal_pairing_code_repository() -> TerminalPairingCodeRepositoryImpl:
    return _inj.get(TerminalPairingCodeRepositoryImpl)


def get_pin_lock_repository() -> PinLockRepositoryImpl:
    return _inj.get(PinLockRepositoryImpl)


def get_home_overview_query_repository() -> HomeOverviewQueryRepositoryImpl:
    return _inj.get(HomeOverviewQueryRepositoryImpl)


def get_device_catalog_query_repository() -> DeviceCatalogQueryRepositoryImpl:
    return _inj.get(DeviceCatalogQueryRepositoryImpl)


def get_settings_snapshot_query_repository() -> SettingsSnapshotQueryRepositoryImpl:
    return _inj.get(SettingsSnapshotQueryRepositoryImpl)


def get_favorites_query_repository() -> FavoritesQueryRepositoryImpl:
    return _inj.get(FavoritesQueryRepositoryImpl)


def get_editor_draft_query_repository() -> EditorDraftQueryRepositoryImpl:
    return _inj.get(EditorDraftQueryRepositoryImpl)


def get_editor_lease_query_repository() -> EditorLeaseQueryRepositoryImpl:
    return _inj.get(EditorLeaseQueryRepositoryImpl)


def get_device_control_query_repository() -> DeviceControlQueryRepositoryImpl:
    return _inj.get(DeviceControlQueryRepositoryImpl)


def get_device_repository() -> DeviceRepositoryImpl:
    return _inj.get(DeviceRepositoryImpl)


def get_device_catalog_command_repository() -> DeviceCatalogCommandRepositoryImpl:
    return _inj.get(DeviceCatalogCommandRepositoryImpl)


def get_device_runtime_state_repository() -> DeviceRuntimeStateRepositoryImpl:
    return _inj.get(DeviceRuntimeStateRepositoryImpl)


def get_device_control_schema_repository() -> DeviceControlSchemaRepositoryImpl:
    return _inj.get(DeviceControlSchemaRepositoryImpl)


def get_device_control_request_repository() -> DeviceControlRequestRepositoryImpl:
    return _inj.get(DeviceControlRequestRepositoryImpl)


def get_device_control_transition_repository() -> DeviceControlTransitionRepositoryImpl:
    return _inj.get(DeviceControlTransitionRepositoryImpl)


def get_ws_event_outbox_repository() -> WsEventOutboxRepositoryImpl:
    return _inj.get(WsEventOutboxRepositoryImpl)


def get_ha_realtime_sync_repository() -> HaRealtimeSyncRepositoryImpl:
    return _inj.get(HaRealtimeSyncRepositoryImpl)


def get_terminal_presence_repository() -> TerminalPresenceRepositoryImpl:
    return _inj.get(TerminalPresenceRepositoryImpl)


def get_settings_version_repository() -> SettingsVersionRepositoryImpl:
    return _inj.get(SettingsVersionRepositoryImpl)


def get_favorite_devices_repository() -> FavoriteDevicesRepositoryImpl:
    return _inj.get(FavoriteDevicesRepositoryImpl)


def get_page_settings_repository() -> PageSettingsRepositoryImpl:
    return _inj.get(PageSettingsRepositoryImpl)


def get_function_settings_repository() -> FunctionSettingsRepositoryImpl:
    return _inj.get(FunctionSettingsRepositoryImpl)


def get_layout_version_repository() -> LayoutVersionRepositoryImpl:
    return _inj.get(LayoutVersionRepositoryImpl)


def get_layout_hotspot_repository() -> LayoutHotspotRepositoryImpl:
    return _inj.get(LayoutHotspotRepositoryImpl)


def get_draft_layout_repository() -> DraftLayoutRepositoryImpl:
    return _inj.get(DraftLayoutRepositoryImpl)


def get_draft_hotspot_repository() -> DraftHotspotRepositoryImpl:
    return _inj.get(DraftHotspotRepositoryImpl)


def get_draft_lease_repository() -> DraftLeaseRepositoryImpl:
    return _inj.get(DraftLeaseRepositoryImpl)


def get_system_connection_repository() -> SystemConnectionRepositoryImpl:
    return _inj.get(SystemConnectionRepositoryImpl)


def get_ha_entity_sync_repository() -> HaEntitySyncRepositoryImpl:
    return _inj.get(HaEntitySyncRepositoryImpl)


def get_energy_account_repository() -> EnergyAccountRepositoryImpl:
    return _inj.get(EnergyAccountRepositoryImpl)


def get_energy_snapshot_repository() -> EnergySnapshotRepositoryImpl:
    return _inj.get(EnergySnapshotRepositoryImpl)


def get_media_binding_repository() -> MediaBindingRepositoryImpl:
    return _inj.get(MediaBindingRepositoryImpl)


def get_backup_repository() -> BackupRepositoryImpl:
    return _inj.get(BackupRepositoryImpl)


def get_backup_restore_repository() -> BackupRestoreRepositoryImpl:
    return _inj.get(BackupRestoreRepositoryImpl)


def get_page_asset_repository() -> PageAssetRepositoryImpl:
    return _inj.get(PageAssetRepositoryImpl)


def get_unit_of_work() -> PostgresUnitOfWork:
    return _inj.get(PostgresUnitOfWork)


def get_management_pin_guard() -> ManagementPinGuard:
    return _inj.get(ManagementPinGuard)


def get_access_token_resolver() -> JwtAccessTokenResolver:
    return _inj.get(JwtAccessTokenResolver)


def get_bootstrap_token_resolver() -> JwtBootstrapTokenResolver:
    return _inj.get(JwtBootstrapTokenResolver)


def get_request_context_service() -> RequestContextService:
    return _inj.get(RequestContextService)


def get_session_query_service() -> SessionQueryService:
    return _inj.get(SessionQueryService)


def get_pin_verification_service() -> PinVerificationService:
    return _inj.get(PinVerificationService)


def get_bootstrap_token_service() -> BootstrapTokenService:
    return _inj.get(BootstrapTokenService)


def get_terminal_pairing_code_service() -> TerminalPairingCodeService:
    return _inj.get(TerminalPairingCodeService)


def get_home_overview_query_service() -> HomeOverviewQueryService:
    return _inj.get(HomeOverviewQueryService)


def get_device_catalog_service() -> DeviceCatalogService:
    return _inj.get(DeviceCatalogService)


def get_ha_entity_sync_service() -> HaEntitySyncService:
    return _inj.get(HaEntitySyncService)


def get_ha_realtime_sync_service() -> HaRealtimeSyncService:
    return _inj.get(HaRealtimeSyncService)


def get_device_control_result_query_service() -> DeviceControlResultQueryService:
    return _inj.get(DeviceControlResultQueryService)


def get_realtime_service() -> RealtimeService:
    return _inj.get(RealtimeService)


def get_device_control_command_service() -> DeviceControlCommandService:
    return _inj.get(DeviceControlCommandService)


def get_system_connection_service() -> SystemConnectionService:
    return _inj.get(SystemConnectionService)


def get_settings_query_service() -> SettingsQueryService:
    return _inj.get(SettingsQueryService)


def get_favorites_query_service() -> FavoritesQueryService:
    return _inj.get(FavoritesQueryService)


def get_sgcc_login_qr_code_service() -> SgccLoginQrCodeService:
    return _inj.get(SgccLoginQrCodeService)


def get_sgcc_container_restarter() -> SgccContainerRestarter:
    return _inj.get(SgccContainerRestarter)


def get_settings_save_service() -> SettingsSaveService:
    return _inj.get(SettingsSaveService)


def get_editor_session_service() -> EditorSessionService:
    return _inj.get(EditorSessionService)


def get_editor_draft_service() -> EditorDraftService:
    return _inj.get(EditorDraftService)


def get_editor_publish_service() -> EditorPublishService:
    return _inj.get(EditorPublishService)


def get_energy_upstream_reader() -> EnergyUpstreamReader:
    return _inj.get(EnergyUpstreamReader)


def get_energy_binding_service() -> EnergyBindingService:
    return _inj.get(EnergyBindingService)


def get_energy_refresh_coordinator() -> EnergyRefreshCoordinator:
    return _inj.get(EnergyRefreshCoordinator)


def get_energy_service() -> EnergyService:
    return _inj.get(EnergyService)


def get_energy_auto_refresh_service() -> EnergyAutoRefreshService:
    return _inj.get(EnergyAutoRefreshService)


def get_media_service() -> MediaService:
    return _inj.get(MediaService)


def get_floorplan_asset_service() -> FloorplanAssetService:
    return _inj.get(FloorplanAssetService)


def get_backup_service() -> BackupService:
    return _inj.get(BackupService)


def get_backup_restore_service() -> BackupRestoreService:
    return _inj.get(BackupRestoreService)
