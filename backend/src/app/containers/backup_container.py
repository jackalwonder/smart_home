from __future__ import annotations

from functools import lru_cache

from src.app.containers import auth_container, core_container, repositories_container
from src.modules.backups.services.BackupRestoreService import BackupRestoreService
from src.modules.backups.services.BackupService import BackupService
from src.modules.media.services.MediaService import MediaService
from src.modules.page_assets.services.FloorplanAssetService import FloorplanAssetService


@lru_cache(maxsize=1)
def get_media_service() -> MediaService:
    return MediaService(
        media_binding_repository=repositories_container.get_media_binding_repository(),
        device_repository=repositories_container.get_device_repository(),
        device_control_schema_repository=repositories_container.get_device_control_schema_repository(),
        device_runtime_state_repository=repositories_container.get_device_runtime_state_repository(),
        management_pin_guard=auth_container.get_management_pin_guard(),
    )


@lru_cache(maxsize=1)
def get_floorplan_asset_service() -> FloorplanAssetService:
    return FloorplanAssetService(
        page_asset_repository=repositories_container.get_page_asset_repository(),
        asset_storage=core_container.get_asset_storage(),
        management_pin_guard=auth_container.get_management_pin_guard(),
        clock=core_container.get_clock(),
    )


@lru_cache(maxsize=1)
def get_backup_service() -> BackupService:
    return BackupService(
        backup_repository=repositories_container.get_backup_repository(),
        management_pin_guard=auth_container.get_management_pin_guard(),
        clock=core_container.get_clock(),
    )


@lru_cache(maxsize=1)
def get_backup_restore_service() -> BackupRestoreService:
    return BackupRestoreService(
        backup_restore_repository=repositories_container.get_backup_restore_repository(),
        unit_of_work=repositories_container.get_unit_of_work(),
        management_pin_guard=auth_container.get_management_pin_guard(),
        settings_version_repository=repositories_container.get_settings_version_repository(),
        favorite_devices_repository=repositories_container.get_favorite_devices_repository(),
        page_settings_repository=repositories_container.get_page_settings_repository(),
        function_settings_repository=repositories_container.get_function_settings_repository(),
        layout_version_repository=repositories_container.get_layout_version_repository(),
        layout_hotspot_repository=repositories_container.get_layout_hotspot_repository(),
        ws_event_outbox_repository=repositories_container.get_ws_event_outbox_repository(),
        version_token_generator=core_container.get_version_token_generator(),
        event_id_generator=core_container.get_event_id_generator(),
        clock=core_container.get_clock(),
    )
