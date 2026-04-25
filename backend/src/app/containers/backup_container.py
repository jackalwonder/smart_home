from __future__ import annotations

from functools import lru_cache

from src.modules.backups.services.BackupRestoreService import BackupRestoreService
from src.modules.backups.services.BackupService import BackupService
from src.modules.media.services.MediaService import MediaService
from src.modules.page_assets.services.FloorplanAssetService import FloorplanAssetService


def _root():
    from src.app import container

    return container


@lru_cache(maxsize=1)
def get_media_service() -> MediaService:
    root = _root()
    return MediaService(
        media_binding_repository=root.get_media_binding_repository(),
        device_repository=root.get_device_repository(),
        device_control_schema_repository=root.get_device_control_schema_repository(),
        device_runtime_state_repository=root.get_device_runtime_state_repository(),
        management_pin_guard=root.get_management_pin_guard(),
    )


@lru_cache(maxsize=1)
def get_floorplan_asset_service() -> FloorplanAssetService:
    root = _root()
    return FloorplanAssetService(
        page_asset_repository=root.get_page_asset_repository(),
        asset_storage=root.get_asset_storage(),
        management_pin_guard=root.get_management_pin_guard(),
        clock=root.get_clock(),
    )


@lru_cache(maxsize=1)
def get_backup_service() -> BackupService:
    root = _root()
    return BackupService(
        backup_repository=root.get_backup_repository(),
        management_pin_guard=root.get_management_pin_guard(),
        clock=root.get_clock(),
    )


@lru_cache(maxsize=1)
def get_backup_restore_service() -> BackupRestoreService:
    root = _root()
    return BackupRestoreService(
        backup_restore_repository=root.get_backup_restore_repository(),
        unit_of_work=root.get_unit_of_work(),
        management_pin_guard=root.get_management_pin_guard(),
        settings_version_repository=root.get_settings_version_repository(),
        favorite_devices_repository=root.get_favorite_devices_repository(),
        page_settings_repository=root.get_page_settings_repository(),
        function_settings_repository=root.get_function_settings_repository(),
        layout_version_repository=root.get_layout_version_repository(),
        layout_hotspot_repository=root.get_layout_hotspot_repository(),
        ws_event_outbox_repository=root.get_ws_event_outbox_repository(),
        version_token_generator=root.get_version_token_generator(),
        event_id_generator=root.get_event_id_generator(),
        clock=root.get_clock(),
    )
