from __future__ import annotations

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import as_dict, session_scope, to_jsonb
from src.repositories.base.settings.FunctionSettingsRepository import (
    FunctionSettingsSnapshotRow,
)
from src.shared.kernel.RepoContext import RepoContext


class FunctionSettingsRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def upsert_for_settings_version(
        self,
        input: FunctionSettingsSnapshotRow,
        ctx: RepoContext | None = None,
    ) -> None:
        stmt = text(
            """
            INSERT INTO function_settings (
                home_id,
                settings_version_id,
                low_battery_threshold,
                offline_threshold_seconds,
                quick_entry_policy_json,
                music_enabled,
                favorite_limit,
                auto_home_timeout_seconds,
                position_device_thresholds_json
            ) VALUES (
                :home_id,
                :settings_version_id,
                :low_battery_threshold,
                :offline_threshold_seconds,
                :quick_entry_policy_json,
                :music_enabled,
                :favorite_limit,
                :auto_home_timeout_seconds,
                :position_device_thresholds_json
            )
            ON CONFLICT (settings_version_id) DO UPDATE SET
                low_battery_threshold = EXCLUDED.low_battery_threshold,
                offline_threshold_seconds = EXCLUDED.offline_threshold_seconds,
                quick_entry_policy_json = EXCLUDED.quick_entry_policy_json,
                music_enabled = EXCLUDED.music_enabled,
                favorite_limit = EXCLUDED.favorite_limit,
                auto_home_timeout_seconds = EXCLUDED.auto_home_timeout_seconds,
                position_device_thresholds_json = EXCLUDED.position_device_thresholds_json,
                updated_at = now()
            """
        )
        async with session_scope(self._database, ctx) as (session, owned):
            await session.execute(
                stmt,
                {
                    "home_id": input.home_id,
                    "settings_version_id": input.settings_version_id,
                    "low_battery_threshold": input.low_battery_threshold,
                    "offline_threshold_seconds": input.offline_threshold_seconds,
                    "quick_entry_policy_json": to_jsonb(as_dict(input.quick_entry_policy_json)),
                    "music_enabled": input.music_enabled,
                    "favorite_limit": input.favorite_limit,
                    "auto_home_timeout_seconds": input.auto_home_timeout_seconds,
                    "position_device_thresholds_json": to_jsonb(as_dict(input.position_device_thresholds_json)),
                },
            )
            if owned:
                await session.commit()
