from __future__ import annotations

from injector import Module, provider, singleton

from src.shared.kernel.implementations import SystemClock, UuidEventIdGenerator
from src.shared.kernel.implementations import TimestampVersionTokenGenerator
from src.modules.auth.services.guard.ManagementPinGuard import ManagementPinGuard
from src.modules.backups.services.BackupRestoreService import BackupRestoreService
from src.modules.backups.services.BackupService import BackupService
from src.modules.media.services.MediaService import MediaService
from src.modules.page_assets.services.FloorplanAssetService import FloorplanAssetService
from src.infrastructure.db.repositories.base.backups.BackupRepositoryImpl import (
    BackupRepositoryImpl,
)
from src.infrastructure.db.repositories.base.backups.BackupRestoreRepositoryImpl import (
    BackupRestoreRepositoryImpl,
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
from src.infrastructure.db.repositories.base.media.MediaBindingRepositoryImpl import (
    MediaBindingRepositoryImpl,
)
from src.infrastructure.db.repositories.base.devices.DeviceRepositoryImpl import DeviceRepositoryImpl
from src.infrastructure.db.repositories.base.devices.DeviceControlSchemaRepositoryImpl import (
    DeviceControlSchemaRepositoryImpl,
)
from src.infrastructure.db.repositories.base.devices.DeviceRuntimeStateRepositoryImpl import (
    DeviceRuntimeStateRepositoryImpl,
)
from src.infrastructure.db.repositories.base.page_assets.PageAssetRepositoryImpl import (
    PageAssetRepositoryImpl,
)
from src.infrastructure.db.repositories.base.realtime.WsEventOutboxRepositoryImpl import (
    WsEventOutboxRepositoryImpl,
)
from src.infrastructure.db.unit_of_work.PostgresUnitOfWork import PostgresUnitOfWork
from src.infrastructure.storage.FileSystemAssetStorage import FileSystemAssetStorage


class BackupModule(Module):
    @provider
    @singleton
    def provide_media_service(
        self,
        media_binding_repository: MediaBindingRepositoryImpl,
        device_repository: DeviceRepositoryImpl,
        device_control_schema_repository: DeviceControlSchemaRepositoryImpl,
        device_runtime_state_repository: DeviceRuntimeStateRepositoryImpl,
        management_pin_guard: ManagementPinGuard,
    ) -> MediaService:
        return MediaService(
            media_binding_repository=media_binding_repository,
            device_repository=device_repository,
            device_control_schema_repository=device_control_schema_repository,
            device_runtime_state_repository=device_runtime_state_repository,
            management_pin_guard=management_pin_guard,
        )

    @provider
    @singleton
    def provide_floorplan_asset_service(
        self,
        page_asset_repository: PageAssetRepositoryImpl,
        asset_storage: FileSystemAssetStorage,
        management_pin_guard: ManagementPinGuard,
        clock: SystemClock,
    ) -> FloorplanAssetService:
        return FloorplanAssetService(
            page_asset_repository=page_asset_repository,
            asset_storage=asset_storage,
            management_pin_guard=management_pin_guard,
            clock=clock,
        )

    @provider
    @singleton
    def provide_backup_service(
        self,
        backup_repository: BackupRepositoryImpl,
        management_pin_guard: ManagementPinGuard,
        clock: SystemClock,
    ) -> BackupService:
        return BackupService(
            backup_repository=backup_repository,
            management_pin_guard=management_pin_guard,
            clock=clock,
        )

    @provider
    @singleton
    def provide_backup_restore_service(
        self,
        backup_restore_repository: BackupRestoreRepositoryImpl,
        unit_of_work: PostgresUnitOfWork,
        management_pin_guard: ManagementPinGuard,
        settings_version_repository: SettingsVersionRepositoryImpl,
        favorite_devices_repository: FavoriteDevicesRepositoryImpl,
        page_settings_repository: PageSettingsRepositoryImpl,
        function_settings_repository: FunctionSettingsRepositoryImpl,
        layout_version_repository: LayoutVersionRepositoryImpl,
        layout_hotspot_repository: LayoutHotspotRepositoryImpl,
        ws_event_outbox_repository: WsEventOutboxRepositoryImpl,
        version_token_generator: TimestampVersionTokenGenerator,
        event_id_generator: UuidEventIdGenerator,
        clock: SystemClock,
    ) -> BackupRestoreService:
        return BackupRestoreService(
            backup_restore_repository=backup_restore_repository,
            unit_of_work=unit_of_work,
            management_pin_guard=management_pin_guard,
            settings_version_repository=settings_version_repository,
            favorite_devices_repository=favorite_devices_repository,
            page_settings_repository=page_settings_repository,
            function_settings_repository=function_settings_repository,
            layout_version_repository=layout_version_repository,
            layout_hotspot_repository=layout_hotspot_repository,
            ws_event_outbox_repository=ws_event_outbox_repository,
            version_token_generator=version_token_generator,
            event_id_generator=event_id_generator,
            clock=clock,
        )
