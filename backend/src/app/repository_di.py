from __future__ import annotations

from injector import Module, provider, singleton

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
from src.infrastructure.db.repositories.base.devices.DeviceCatalogCommandRepositoryImpl import (
    DeviceCatalogCommandRepositoryImpl,
)
from src.infrastructure.db.repositories.base.devices.DeviceControlSchemaRepositoryImpl import (
    DeviceControlSchemaRepositoryImpl,
)
from src.infrastructure.db.repositories.base.devices.DeviceRepositoryImpl import DeviceRepositoryImpl
from src.infrastructure.db.repositories.base.devices.DeviceRuntimeStateRepositoryImpl import (
    DeviceRuntimeStateRepositoryImpl,
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
from src.infrastructure.db.repositories.base.realtime.HaRealtimeSyncRepositoryImpl import (
    HaRealtimeSyncRepositoryImpl,
)
from src.infrastructure.db.repositories.base.realtime.TerminalPresenceRepositoryImpl import (
    TerminalPresenceRepositoryImpl,
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
from src.infrastructure.db.repositories.base.system.HaEntitySyncRepositoryImpl import (
    HaEntitySyncRepositoryImpl,
)
from src.infrastructure.db.repositories.base.system.SystemConnectionRepositoryImpl import (
    SystemConnectionRepositoryImpl,
)
from src.infrastructure.db.repositories.query.auth.AuthSessionQueryRepositoryImpl import (
    AuthSessionQueryRepositoryImpl,
)
from src.infrastructure.db.repositories.query.auth.RequestContextRepositoryImpl import (
    RequestContextRepositoryImpl,
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
from src.infrastructure.db.repositories.query.overview.DeviceCatalogQueryRepositoryImpl import (
    DeviceCatalogQueryRepositoryImpl,
)
from src.infrastructure.db.repositories.query.overview.HomeOverviewQueryRepositoryImpl import (
    HomeOverviewQueryRepositoryImpl,
)
from src.infrastructure.db.repositories.query.settings.FavoritesQueryRepositoryImpl import (
    FavoritesQueryRepositoryImpl,
)
from src.infrastructure.db.repositories.query.settings.SettingsSnapshotQueryRepositoryImpl import (
    SettingsSnapshotQueryRepositoryImpl,
)
from src.infrastructure.db.unit_of_work.PostgresUnitOfWork import PostgresUnitOfWork


class RepositoryModule(Module):
    @provider
    @singleton
    def provide_auth_session_query_repository(
        self, db: Database
    ) -> AuthSessionQueryRepositoryImpl:
        return AuthSessionQueryRepositoryImpl(db)

    @provider
    @singleton
    def provide_request_context_repository(
        self, db: Database
    ) -> RequestContextRepositoryImpl:
        return RequestContextRepositoryImpl(db)

    @provider
    @singleton
    def provide_home_auth_config_repository(
        self, db: Database
    ) -> HomeAuthConfigRepositoryImpl:
        return HomeAuthConfigRepositoryImpl(db)

    @provider
    @singleton
    def provide_pin_session_repository(self, db: Database) -> PinSessionRepositoryImpl:
        return PinSessionRepositoryImpl(db)

    @provider
    @singleton
    def provide_terminal_bootstrap_token_repository(
        self, db: Database
    ) -> TerminalBootstrapTokenRepositoryImpl:
        return TerminalBootstrapTokenRepositoryImpl(db)

    @provider
    @singleton
    def provide_terminal_pairing_code_repository(
        self, db: Database
    ) -> TerminalPairingCodeRepositoryImpl:
        return TerminalPairingCodeRepositoryImpl(db)

    @provider
    @singleton
    def provide_pin_lock_repository(self, db: Database) -> PinLockRepositoryImpl:
        return PinLockRepositoryImpl(db)

    @provider
    @singleton
    def provide_home_overview_query_repository(
        self, db: Database
    ) -> HomeOverviewQueryRepositoryImpl:
        return HomeOverviewQueryRepositoryImpl(db)

    @provider
    @singleton
    def provide_device_catalog_query_repository(
        self, db: Database
    ) -> DeviceCatalogQueryRepositoryImpl:
        return DeviceCatalogQueryRepositoryImpl(db)

    @provider
    @singleton
    def provide_settings_snapshot_query_repository(
        self, db: Database
    ) -> SettingsSnapshotQueryRepositoryImpl:
        return SettingsSnapshotQueryRepositoryImpl(db)

    @provider
    @singleton
    def provide_favorites_query_repository(
        self, db: Database
    ) -> FavoritesQueryRepositoryImpl:
        return FavoritesQueryRepositoryImpl(db)

    @provider
    @singleton
    def provide_editor_draft_query_repository(
        self, db: Database
    ) -> EditorDraftQueryRepositoryImpl:
        return EditorDraftQueryRepositoryImpl(db)

    @provider
    @singleton
    def provide_editor_lease_query_repository(
        self, db: Database
    ) -> EditorLeaseQueryRepositoryImpl:
        return EditorLeaseQueryRepositoryImpl(db)

    @provider
    @singleton
    def provide_device_control_query_repository(
        self, db: Database
    ) -> DeviceControlQueryRepositoryImpl:
        return DeviceControlQueryRepositoryImpl(db)

    @provider
    @singleton
    def provide_device_repository(self, db: Database) -> DeviceRepositoryImpl:
        return DeviceRepositoryImpl(db)

    @provider
    @singleton
    def provide_device_catalog_command_repository(
        self, db: Database
    ) -> DeviceCatalogCommandRepositoryImpl:
        return DeviceCatalogCommandRepositoryImpl(db)

    @provider
    @singleton
    def provide_device_runtime_state_repository(
        self, db: Database
    ) -> DeviceRuntimeStateRepositoryImpl:
        return DeviceRuntimeStateRepositoryImpl(db)

    @provider
    @singleton
    def provide_device_control_schema_repository(
        self, db: Database
    ) -> DeviceControlSchemaRepositoryImpl:
        return DeviceControlSchemaRepositoryImpl(db)

    @provider
    @singleton
    def provide_device_control_request_repository(
        self, db: Database
    ) -> DeviceControlRequestRepositoryImpl:
        return DeviceControlRequestRepositoryImpl(db)

    @provider
    @singleton
    def provide_device_control_transition_repository(
        self, db: Database
    ) -> DeviceControlTransitionRepositoryImpl:
        return DeviceControlTransitionRepositoryImpl(db)

    @provider
    @singleton
    def provide_ws_event_outbox_repository(
        self, db: Database
    ) -> WsEventOutboxRepositoryImpl:
        return WsEventOutboxRepositoryImpl(db)

    @provider
    @singleton
    def provide_ha_realtime_sync_repository(
        self, db: Database
    ) -> HaRealtimeSyncRepositoryImpl:
        return HaRealtimeSyncRepositoryImpl(db)

    @provider
    @singleton
    def provide_terminal_presence_repository(
        self, db: Database
    ) -> TerminalPresenceRepositoryImpl:
        return TerminalPresenceRepositoryImpl(db)

    @provider
    @singleton
    def provide_settings_version_repository(
        self, db: Database
    ) -> SettingsVersionRepositoryImpl:
        return SettingsVersionRepositoryImpl(db)

    @provider
    @singleton
    def provide_favorite_devices_repository(
        self, db: Database
    ) -> FavoriteDevicesRepositoryImpl:
        return FavoriteDevicesRepositoryImpl(db)

    @provider
    @singleton
    def provide_page_settings_repository(
        self, db: Database
    ) -> PageSettingsRepositoryImpl:
        return PageSettingsRepositoryImpl(db)

    @provider
    @singleton
    def provide_function_settings_repository(
        self, db: Database
    ) -> FunctionSettingsRepositoryImpl:
        return FunctionSettingsRepositoryImpl(db)

    @provider
    @singleton
    def provide_layout_version_repository(
        self, db: Database
    ) -> LayoutVersionRepositoryImpl:
        return LayoutVersionRepositoryImpl(db)

    @provider
    @singleton
    def provide_layout_hotspot_repository(
        self, db: Database
    ) -> LayoutHotspotRepositoryImpl:
        return LayoutHotspotRepositoryImpl(db)

    @provider
    @singleton
    def provide_draft_layout_repository(
        self, db: Database
    ) -> DraftLayoutRepositoryImpl:
        return DraftLayoutRepositoryImpl(db)

    @provider
    @singleton
    def provide_draft_hotspot_repository(
        self, db: Database
    ) -> DraftHotspotRepositoryImpl:
        return DraftHotspotRepositoryImpl(db)

    @provider
    @singleton
    def provide_draft_lease_repository(
        self, db: Database
    ) -> DraftLeaseRepositoryImpl:
        return DraftLeaseRepositoryImpl(db)

    @provider
    @singleton
    def provide_system_connection_repository(
        self, db: Database
    ) -> SystemConnectionRepositoryImpl:
        return SystemConnectionRepositoryImpl(db)

    @provider
    @singleton
    def provide_ha_entity_sync_repository(
        self, db: Database
    ) -> HaEntitySyncRepositoryImpl:
        return HaEntitySyncRepositoryImpl(db)

    @provider
    @singleton
    def provide_energy_account_repository(
        self, db: Database
    ) -> EnergyAccountRepositoryImpl:
        return EnergyAccountRepositoryImpl(db)

    @provider
    @singleton
    def provide_energy_snapshot_repository(
        self, db: Database
    ) -> EnergySnapshotRepositoryImpl:
        return EnergySnapshotRepositoryImpl(db)

    @provider
    @singleton
    def provide_media_binding_repository(
        self, db: Database
    ) -> MediaBindingRepositoryImpl:
        return MediaBindingRepositoryImpl(db)

    @provider
    @singleton
    def provide_backup_repository(self, db: Database) -> BackupRepositoryImpl:
        return BackupRepositoryImpl(db)

    @provider
    @singleton
    def provide_backup_restore_repository(
        self, db: Database
    ) -> BackupRestoreRepositoryImpl:
        return BackupRestoreRepositoryImpl(db)

    @provider
    @singleton
    def provide_page_asset_repository(self, db: Database) -> PageAssetRepositoryImpl:
        return PageAssetRepositoryImpl(db)

    @provider
    @singleton
    def provide_unit_of_work(self, db: Database) -> PostgresUnitOfWork:
        return PostgresUnitOfWork(db)
