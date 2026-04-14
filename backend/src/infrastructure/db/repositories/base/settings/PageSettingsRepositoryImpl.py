from __future__ import annotations

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import as_dict, session_scope, to_jsonb
from src.repositories.base.settings.PageSettingsRepository import PageSettingsSnapshotRow
from src.shared.kernel.RepoContext import RepoContext


class PageSettingsRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def upsert_for_settings_version(
        self,
        input: PageSettingsSnapshotRow,
        ctx: RepoContext | None = None,
    ) -> None:
        stmt = text(
            """
            INSERT INTO page_settings (
                home_id,
                settings_version_id,
                room_label_mode,
                homepage_display_policy_json,
                icon_policy_json,
                layout_preference_json
            ) VALUES (
                :home_id,
                :settings_version_id,
                :room_label_mode,
                :homepage_display_policy_json,
                :icon_policy_json,
                :layout_preference_json
            )
            ON CONFLICT (settings_version_id) DO UPDATE SET
                room_label_mode = EXCLUDED.room_label_mode,
                homepage_display_policy_json = EXCLUDED.homepage_display_policy_json,
                icon_policy_json = EXCLUDED.icon_policy_json,
                layout_preference_json = EXCLUDED.layout_preference_json,
                updated_at = now()
            """
        )
        async with session_scope(self._database, ctx) as (session, owned):
            await session.execute(
                stmt,
                {
                    "home_id": input.home_id,
                    "settings_version_id": input.settings_version_id,
                    "room_label_mode": input.room_label_mode,
                    "homepage_display_policy_json": to_jsonb(as_dict(input.homepage_display_policy_json)),
                    "icon_policy_json": to_jsonb(as_dict(input.icon_policy_json)),
                    "layout_preference_json": to_jsonb(as_dict(input.layout_preference_json)),
                },
            )
            if owned:
                await session.commit()
