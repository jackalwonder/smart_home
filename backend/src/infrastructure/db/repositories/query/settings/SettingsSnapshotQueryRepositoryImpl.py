from __future__ import annotations

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import as_dict, session_scope
from src.repositories.query.settings.SettingsSnapshotQueryRepository import (
    SettingsSnapshotReadModel,
)
from src.repositories.read_models.index import (
    CurrentSettingsVersion,
    FavoriteDeviceReadModel,
    FunctionSettingsReadModel,
    PageSettingsReadModel,
)
from src.shared.kernel.RepoContext import RepoContext


class SettingsSnapshotQueryRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def get_current_settings_snapshot(
        self,
        home_id: str,
        ctx: RepoContext | None = None,
    ) -> SettingsSnapshotReadModel:
        async with session_scope(self._database, ctx) as (session, _):
            current = (
                await session.execute(
                    text(
                        """
                        SELECT
                            id::text AS id,
                            home_id::text AS home_id,
                            settings_version,
                            effective_at::text AS effective_at
                        FROM v_current_settings_versions
                        WHERE home_id = :home_id
                        """
                    ),
                    {"home_id": home_id},
                )
            ).mappings().one_or_none()
            if current is None:
                return SettingsSnapshotReadModel(
                    current_settings_version=None,
                    page_settings=None,
                    function_settings=None,
                    favorites=[],
                )

            page = (
                await session.execute(
                    text(
                        """
                        SELECT
                            room_label_mode,
                            homepage_display_policy_json,
                            icon_policy_json,
                            layout_preference_json
                        FROM page_settings
                        WHERE settings_version_id = :settings_version_id
                        """
                    ),
                    {"settings_version_id": current["id"]},
                )
            ).mappings().one_or_none()
            function = (
                await session.execute(
                    text(
                        """
                        SELECT
                            music_enabled,
                            low_battery_threshold::float8 AS low_battery_threshold,
                            offline_threshold_seconds,
                            favorite_limit,
                            quick_entry_policy_json,
                            auto_home_timeout_seconds,
                            position_device_thresholds_json
                        FROM function_settings
                        WHERE settings_version_id = :settings_version_id
                        """
                    ),
                    {"settings_version_id": current["id"]},
                )
            ).mappings().one_or_none()
            favorite_rows = (
                await session.execute(
                    text(
                        """
                        SELECT
                            device_id::text AS device_id,
                            selected,
                            favorite_order
                        FROM favorite_devices
                        WHERE settings_version_id = :settings_version_id
                        ORDER BY favorite_order ASC NULLS LAST, created_at ASC
                        """
                    ),
                    {"settings_version_id": current["id"]},
                )
            ).mappings().all()

        return SettingsSnapshotReadModel(
            current_settings_version=CurrentSettingsVersion(
                id=current["id"],
                home_id=current["home_id"],
                settings_version=current["settings_version"],
                effective_at=current["effective_at"],
            ),
            page_settings=PageSettingsReadModel(
                room_label_mode=page["room_label_mode"],
                homepage_display_policy=as_dict(page["homepage_display_policy_json"]),
                icon_policy=as_dict(page["icon_policy_json"]),
                layout_preference=as_dict(page["layout_preference_json"]),
            )
            if page is not None
            else None,
            function_settings=FunctionSettingsReadModel(
                music_enabled=function["music_enabled"],
                low_battery_threshold=function["low_battery_threshold"],
                offline_threshold_seconds=function["offline_threshold_seconds"],
                favorite_limit=function["favorite_limit"],
                quick_entry_policy=as_dict(function["quick_entry_policy_json"]),
                auto_home_timeout_seconds=function["auto_home_timeout_seconds"],
                position_device_thresholds=as_dict(function["position_device_thresholds_json"]),
            )
            if function is not None
            else None,
            favorites=[
                FavoriteDeviceReadModel(
                    device_id=row["device_id"],
                    selected=row["selected"],
                    favorite_order=row["favorite_order"],
                )
                for row in favorite_rows
            ],
        )
