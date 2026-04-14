from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from src.repositories.query.settings.SettingsSnapshotQueryRepository import (
    SettingsSnapshotQueryRepository,
)
from src.repositories.read_models.index import (
    FavoriteDeviceReadModel,
    FunctionSettingsReadModel,
    PageSettingsReadModel,
)


@dataclass(frozen=True)
class SettingsQueryInput:
    home_id: str


@dataclass(frozen=True)
class SettingsView:
    settings_version: str | None
    page_settings: PageSettingsReadModel | None
    function_settings: FunctionSettingsReadModel | None
    favorites: list[FavoriteDeviceReadModel]
    system_settings_summary: dict[str, Any]
    pin_session_required: bool


class SettingsQueryService:
    def __init__(self, settings_snapshot_query_repository: SettingsSnapshotQueryRepository) -> None:
        self._settings_snapshot_query_repository = settings_snapshot_query_repository

    async def get_settings(self, input: SettingsQueryInput) -> SettingsView:
        snapshot = await self._settings_snapshot_query_repository.get_current_settings_snapshot(
            input.home_id
        )
        return SettingsView(
            settings_version=(
                snapshot.current_settings_version.settings_version
                if snapshot.current_settings_version is not None
                else None
            ),
            page_settings=snapshot.page_settings,
            function_settings=snapshot.function_settings,
            favorites=snapshot.favorites,
            system_settings_summary={
                "system_connections_configured": False,
                "energy_binding_status": "UNBOUND",
                "default_media_binding_status": "MEDIA_UNSET",
            },
            pin_session_required=True,
        )

    async def get_page_settings(self, input: SettingsQueryInput) -> dict:
        view = await self.get_settings(input)
        page_settings = view.page_settings
        return {
            "settings_version": view.settings_version,
            "room_label_mode": page_settings.room_label_mode if page_settings is not None else "ROOM_NAME",
            "homepage_display_policy": (
                page_settings.homepage_display_policy if page_settings is not None else {}
            ),
            "icon_policy": page_settings.icon_policy if page_settings is not None else {},
            "layout_preference": page_settings.layout_preference if page_settings is not None else {},
        }

    async def get_function_settings(self, input: SettingsQueryInput) -> dict:
        view = await self.get_settings(input)
        function_settings = view.function_settings
        return {
            "settings_version": view.settings_version,
            "low_battery_threshold": (
                function_settings.low_battery_threshold if function_settings is not None else 20
            ),
            "offline_threshold_seconds": (
                function_settings.offline_threshold_seconds if function_settings is not None else 300
            ),
            "quick_entry_policy": (
                function_settings.quick_entry_policy if function_settings is not None else {}
            ),
            "music_enabled": function_settings.music_enabled if function_settings is not None else False,
            "favorite_limit": function_settings.favorite_limit if function_settings is not None else 8,
            "auto_home_timeout_seconds": (
                function_settings.auto_home_timeout_seconds if function_settings is not None else 30
            ),
            "position_device_thresholds": (
                function_settings.position_device_thresholds if function_settings is not None else {}
            ),
        }
