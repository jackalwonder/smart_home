from __future__ import annotations

from datetime import datetime, timezone
from functools import lru_cache
from uuid import uuid4

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
from src.infrastructure.db.repositories.base.realtime.WsEventOutboxRepositoryImpl import (
    WsEventOutboxRepositoryImpl,
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
    JwtAccessTokenResolver,
)
from src.modules.auth.services.query.BootstrapTokenResolver import (
    BootstrapTokenResolver,
    JwtBootstrapTokenResolver,
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
from src.modules.energy.services.EnergyService import EnergyService
from src.modules.home_overview.services.query.HomeOverviewQueryService import (
    HomeOverviewQueryService,
)
from src.modules.home_overview.services.DeviceCatalogService import DeviceCatalogService
from src.modules.media.services.MediaService import MediaService
from src.modules.page_assets.services.FloorplanAssetService import FloorplanAssetService
from src.modules.realtime.RealtimeService import RealtimeService
from src.modules.settings.services.command.SettingsSaveService import SettingsSaveService
from src.modules.settings.services.query.FavoritesQueryService import FavoritesQueryService
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
    return OpenMeteoWeatherProvider(get_settings(), get_clock())


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
def get_settings_snapshot_query_repository() -> SettingsSnapshotQueryRepositoryImpl:
    return SettingsSnapshotQueryRepositoryImpl(get_database())


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
def get_energy_account_repository() -> EnergyAccountRepositoryImpl:
    return EnergyAccountRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_energy_snapshot_repository() -> EnergySnapshotRepositoryImpl:
    return EnergySnapshotRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_media_binding_repository() -> MediaBindingRepositoryImpl:
    return MediaBindingRepositoryImpl(get_database())


@lru_cache(maxsize=1)
def get_unit_of_work() -> PostgresUnitOfWork:
    return PostgresUnitOfWork(get_database())


@lru_cache(maxsize=1)
def get_management_pin_guard() -> ManagementPinGuard:
    return ManagementPinGuard(
        pin_session_repository=get_pin_session_repository(),
        clock=get_clock(),
    )


@lru_cache(maxsize=1)
def get_access_token_resolver() -> AccessTokenResolver:
    settings = get_settings()
    return JwtAccessTokenResolver(
        secret=settings.access_token_secret,
        issuer=settings.access_token_issuer,
        audience=settings.access_token_audience,
        ttl_seconds=settings.access_token_ttl_seconds,
        leeway_seconds=settings.access_token_leeway_seconds,
    )


@lru_cache(maxsize=1)
def get_bootstrap_token_resolver() -> BootstrapTokenResolver:
    settings = get_settings()
    return JwtBootstrapTokenResolver(
        secret=settings.bootstrap_token_secret,
        issuer=settings.access_token_issuer,
        audience=settings.access_token_audience,
        ttl_seconds=settings.bootstrap_token_ttl_seconds,
        leeway_seconds=settings.bootstrap_token_leeway_seconds,
    )


def get_request_context_service() -> RequestContextService:
    return RequestContextService(
        get_database(),
        access_token_resolver=get_access_token_resolver(),
    )


@lru_cache(maxsize=1)
def get_session_query_service() -> SessionQueryService:
    return SessionQueryService(
        auth_session_query_repository=get_auth_session_query_repository(),
        capability_provider=get_capability_provider(),
        clock=get_clock(),
    )


@lru_cache(maxsize=1)
def get_pin_verification_service() -> PinVerificationService:
    return PinVerificationService(
        home_auth_config_repository=get_home_auth_config_repository(),
        pin_session_repository=get_pin_session_repository(),
        pin_lock_repository=get_pin_lock_repository(),
        id_generator=get_id_generator(),
        clock=get_clock(),
    )


@lru_cache(maxsize=1)
def get_bootstrap_token_service() -> BootstrapTokenService:
    return BootstrapTokenService(
        repository=get_terminal_bootstrap_token_repository(),
        resolver=get_bootstrap_token_resolver(),
        clock=get_clock(),
    )


@lru_cache(maxsize=1)
def get_terminal_pairing_code_service() -> TerminalPairingCodeService:
    return TerminalPairingCodeService(
        repository=get_terminal_pairing_code_repository(),
        bootstrap_token_service=get_bootstrap_token_service(),
        bootstrap_token_resolver=get_bootstrap_token_resolver(),
        connection_secret_cipher=get_connection_secret_cipher(),
        clock=get_clock(),
        pairing_code_ttl_seconds=get_settings().pairing_code_ttl_seconds,
        pairing_code_issue_cooldown_seconds=get_settings().pairing_code_issue_cooldown_seconds,
    )


@lru_cache(maxsize=1)
def get_home_overview_query_service() -> HomeOverviewQueryService:
    return HomeOverviewQueryService(
        home_overview_query_repository=get_home_overview_query_repository(),
        weather_provider=get_weather_provider(),
    )


@lru_cache(maxsize=1)
def get_device_catalog_service() -> DeviceCatalogService:
    return DeviceCatalogService(
        database=get_database(),
        unit_of_work=get_unit_of_work(),
        device_repository=get_device_repository(),
        management_pin_guard=get_management_pin_guard(),
    )


@lru_cache(maxsize=1)
def get_ha_entity_sync_service() -> HaEntitySyncService:
    return HaEntitySyncService(
        clock=get_clock(),
        device_control_schema_repository=get_device_control_schema_repository(),
    )


@lru_cache(maxsize=1)
def get_ha_realtime_sync_service() -> HaRealtimeSyncService:
    return HaRealtimeSyncService(
        database=get_database(),
        unit_of_work=get_unit_of_work(),
        ha_connection_gateway=get_ha_connection_gateway(),
        ha_entity_sync_service=get_ha_entity_sync_service(),
        system_connection_repository=get_system_connection_repository(),
        ws_event_outbox_repository=get_ws_event_outbox_repository(),
        home_assistant_bootstrap_provider=get_home_assistant_bootstrap_provider(),
        connection_secret_cipher=get_connection_secret_cipher(),
        event_id_generator=get_event_id_generator(),
        clock=get_clock(),
    )


@lru_cache(maxsize=1)
def get_settings_query_service() -> SettingsQueryService:
    return SettingsQueryService(
        settings_snapshot_query_repository=get_settings_snapshot_query_repository(),
    )


@lru_cache(maxsize=1)
def get_favorites_query_service() -> FavoritesQueryService:
    return FavoritesQueryService(get_database())


@lru_cache(maxsize=1)
def get_settings_save_service() -> SettingsSaveService:
    return SettingsSaveService(
        unit_of_work=get_unit_of_work(),
        settings_version_repository=get_settings_version_repository(),
        favorite_devices_repository=get_favorite_devices_repository(),
        page_settings_repository=get_page_settings_repository(),
        function_settings_repository=get_function_settings_repository(),
        ws_event_outbox_repository=get_ws_event_outbox_repository(),
        management_pin_guard=get_management_pin_guard(),
        version_token_generator=get_version_token_generator(),
        event_id_generator=get_event_id_generator(),
        clock=get_clock(),
    )


@lru_cache(maxsize=1)
def get_editor_session_service() -> EditorSessionService:
    return EditorSessionService(
        unit_of_work=get_unit_of_work(),
        editor_lease_query_repository=get_editor_lease_query_repository(),
        draft_lease_repository=get_draft_lease_repository(),
        draft_layout_repository=get_draft_layout_repository(),
        draft_hotspot_repository=get_draft_hotspot_repository(),
        layout_version_repository=get_layout_version_repository(),
        layout_hotspot_repository=get_layout_hotspot_repository(),
        ws_event_outbox_repository=get_ws_event_outbox_repository(),
        management_pin_guard=get_management_pin_guard(),
        id_generator=get_id_generator(),
        version_token_generator=get_version_token_generator(),
        event_id_generator=get_event_id_generator(),
        clock=get_clock(),
    )


@lru_cache(maxsize=1)
def get_editor_draft_service() -> EditorDraftService:
    return EditorDraftService(
        unit_of_work=get_unit_of_work(),
        editor_draft_query_repository=get_editor_draft_query_repository(),
        draft_layout_repository=get_draft_layout_repository(),
        draft_hotspot_repository=get_draft_hotspot_repository(),
        draft_lease_repository=get_draft_lease_repository(),
        layout_version_repository=get_layout_version_repository(),
        layout_hotspot_repository=get_layout_hotspot_repository(),
        management_pin_guard=get_management_pin_guard(),
        version_token_generator=get_version_token_generator(),
        clock=get_clock(),
    )


@lru_cache(maxsize=1)
def get_editor_publish_service() -> EditorPublishService:
    return EditorPublishService(
        unit_of_work=get_unit_of_work(),
        draft_layout_repository=get_draft_layout_repository(),
        draft_hotspot_repository=get_draft_hotspot_repository(),
        draft_lease_repository=get_draft_lease_repository(),
        layout_version_repository=get_layout_version_repository(),
        layout_hotspot_repository=get_layout_hotspot_repository(),
        ws_event_outbox_repository=get_ws_event_outbox_repository(),
        management_pin_guard=get_management_pin_guard(),
        version_token_generator=get_version_token_generator(),
        event_id_generator=get_event_id_generator(),
        clock=get_clock(),
    )


@lru_cache(maxsize=1)
def get_device_control_result_query_service() -> DeviceControlResultQueryService:
    return DeviceControlResultQueryService(
        device_control_query_repository=get_device_control_query_repository(),
    )


@lru_cache(maxsize=1)
def get_realtime_service() -> RealtimeService:
    return RealtimeService(
        ws_event_outbox_repository=get_ws_event_outbox_repository(),
        database=get_database(),
    )


@lru_cache(maxsize=1)
def get_device_control_command_service() -> DeviceControlCommandService:
    return DeviceControlCommandService(
        unit_of_work=get_unit_of_work(),
        device_repository=get_device_repository(),
        device_runtime_state_repository=get_device_runtime_state_repository(),
        device_control_schema_repository=get_device_control_schema_repository(),
        device_control_request_repository=get_device_control_request_repository(),
        device_control_transition_repository=get_device_control_transition_repository(),
        ws_event_outbox_repository=get_ws_event_outbox_repository(),
        ha_control_gateway=get_ha_control_gateway(),
        event_id_generator=get_event_id_generator(),
        clock=get_clock(),
    )


@lru_cache(maxsize=1)
def get_system_connection_service() -> SystemConnectionService:
    return SystemConnectionService(
        system_connection_repository=get_system_connection_repository(),
        settings_version_repository=get_settings_version_repository(),
        management_pin_guard=get_management_pin_guard(),
        ha_connection_gateway=get_ha_connection_gateway(),
        ha_entity_sync_service=get_ha_entity_sync_service(),
        home_assistant_bootstrap_provider=get_home_assistant_bootstrap_provider(),
        connection_secret_cipher=get_connection_secret_cipher(),
        unit_of_work=get_unit_of_work(),
        clock=get_clock(),
    )


@lru_cache(maxsize=1)
def get_energy_service() -> EnergyService:
    return EnergyService(
        energy_account_repository=get_energy_account_repository(),
        energy_snapshot_repository=get_energy_snapshot_repository(),
        ws_event_outbox_repository=get_ws_event_outbox_repository(),
        management_pin_guard=get_management_pin_guard(),
        event_id_generator=get_event_id_generator(),
        clock=get_clock(),
    )


@lru_cache(maxsize=1)
def get_media_service() -> MediaService:
    return MediaService(
        media_binding_repository=get_media_binding_repository(),
        device_repository=get_device_repository(),
        device_control_schema_repository=get_device_control_schema_repository(),
        device_runtime_state_repository=get_device_runtime_state_repository(),
        management_pin_guard=get_management_pin_guard(),
    )


@lru_cache(maxsize=1)
def get_floorplan_asset_service() -> FloorplanAssetService:
    return FloorplanAssetService(
        database=get_database(),
        management_pin_guard=get_management_pin_guard(),
        clock=get_clock(),
    )


@lru_cache(maxsize=1)
def get_backup_service() -> BackupService:
    return BackupService(
        database=get_database(),
        management_pin_guard=get_management_pin_guard(),
        clock=get_clock(),
    )


@lru_cache(maxsize=1)
def get_backup_restore_service() -> BackupRestoreService:
    return BackupRestoreService(
        database=get_database(),
        unit_of_work=get_unit_of_work(),
        management_pin_guard=get_management_pin_guard(),
        settings_version_repository=get_settings_version_repository(),
        favorite_devices_repository=get_favorite_devices_repository(),
        page_settings_repository=get_page_settings_repository(),
        function_settings_repository=get_function_settings_repository(),
        layout_version_repository=get_layout_version_repository(),
        layout_hotspot_repository=get_layout_hotspot_repository(),
        ws_event_outbox_repository=get_ws_event_outbox_repository(),
        version_token_generator=get_version_token_generator(),
        event_id_generator=get_event_id_generator(),
        clock=get_clock(),
    )
