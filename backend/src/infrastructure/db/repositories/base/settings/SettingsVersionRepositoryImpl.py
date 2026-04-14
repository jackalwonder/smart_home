from __future__ import annotations

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import as_list, session_scope, to_jsonb_list
from src.repositories.base.settings.SettingsVersionRepository import NewSettingsVersionRow
from src.repositories.rows.index import CurrentSettingsVersionRow
from src.shared.kernel.RepoContext import RepoContext


def _to_settings_version_row(row) -> CurrentSettingsVersionRow:
    return CurrentSettingsVersionRow(
        id=row["id"],
        home_id=row["home_id"],
        settings_version=row["settings_version"],
        effective_at=row["effective_at"],
    )


class SettingsVersionRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def find_current_by_home(
        self,
        home_id: str,
        ctx: RepoContext | None = None,
    ) -> CurrentSettingsVersionRow | None:
        stmt = text(
            """
            SELECT
                id::text AS id,
                home_id::text AS home_id,
                settings_version,
                effective_at::text AS effective_at
            FROM v_current_settings_versions
            WHERE home_id = :home_id
            """
        )
        async with session_scope(self._database, ctx) as (session, _):
            row = (await session.execute(stmt, {"home_id": home_id})).mappings().one_or_none()
        return _to_settings_version_row(row) if row is not None else None

    async def insert(
        self,
        input: NewSettingsVersionRow,
        ctx: RepoContext | None = None,
    ) -> CurrentSettingsVersionRow:
        stmt = text(
            """
            INSERT INTO settings_versions (
                home_id,
                settings_version,
                updated_domains_json,
                effective_at,
                saved_by_member_id,
                saved_by_terminal_id
            ) VALUES (
                :home_id,
                :settings_version,
                :updated_domains_json,
                :effective_at,
                :saved_by_member_id,
                :saved_by_terminal_id
            )
            RETURNING
                id::text AS id,
                home_id::text AS home_id,
                settings_version,
                effective_at::text AS effective_at
            """
        )
        async with session_scope(self._database, ctx) as (session, owned):
            row = (
                await session.execute(
                    stmt,
                    {
                        "home_id": input.home_id,
                        "settings_version": input.settings_version,
                        "updated_domains_json": to_jsonb_list(as_list(input.updated_domains_json)),
                        "effective_at": input.effective_at,
                        "saved_by_member_id": input.saved_by_member_id,
                        "saved_by_terminal_id": input.saved_by_terminal_id,
                    },
                )
            ).mappings().one()
            if owned:
                await session.commit()
        return _to_settings_version_row(row)
