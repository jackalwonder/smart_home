from __future__ import annotations

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import as_dict, session_scope, to_jsonb
from src.repositories.base.settings.LayoutVersionRepository import NewLayoutVersionRow
from src.repositories.rows.index import CurrentLayoutVersionRow
from src.shared.kernel.RepoContext import RepoContext


def _to_layout_version_row(row) -> CurrentLayoutVersionRow:
    return CurrentLayoutVersionRow(
        id=row["id"],
        home_id=row["home_id"],
        layout_version=row["layout_version"],
        background_asset_id=row["background_asset_id"],
        effective_at=row["effective_at"],
    )


class LayoutVersionRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def find_current_by_home(
        self,
        home_id: str,
        ctx: RepoContext | None = None,
    ) -> CurrentLayoutVersionRow | None:
        stmt = text(
            """
            SELECT
                id::text AS id,
                home_id::text AS home_id,
                layout_version,
                background_asset_id::text AS background_asset_id,
                effective_at::text AS effective_at
            FROM v_current_layout_versions
            WHERE home_id = :home_id
            """
        )
        async with session_scope(self._database, ctx) as (session, _):
            row = (await session.execute(stmt, {"home_id": home_id})).mappings().one_or_none()
        return _to_layout_version_row(row) if row is not None else None

    async def insert(
        self,
        input: NewLayoutVersionRow,
        ctx: RepoContext | None = None,
    ) -> CurrentLayoutVersionRow:
        stmt = text(
            """
            INSERT INTO layout_versions (
                home_id,
                layout_version,
                background_asset_id,
                layout_meta_json,
                effective_at,
                published_by_member_id,
                published_by_terminal_id
            ) VALUES (
                :home_id,
                :layout_version,
                :background_asset_id,
                :layout_meta_json,
                :effective_at,
                :published_by_member_id,
                :published_by_terminal_id
            )
            RETURNING
                id::text AS id,
                home_id::text AS home_id,
                layout_version,
                background_asset_id::text AS background_asset_id,
                effective_at::text AS effective_at
            """
        )
        async with session_scope(self._database, ctx) as (session, owned):
            row = (
                await session.execute(
                    stmt,
                    {
                        "home_id": input.home_id,
                        "layout_version": input.layout_version,
                        "background_asset_id": input.background_asset_id,
                        "layout_meta_json": to_jsonb(as_dict(input.layout_meta_json)),
                        "effective_at": input.effective_at,
                        "published_by_member_id": input.published_by_member_id,
                        "published_by_terminal_id": input.published_by_terminal_id,
                    },
                )
            ).mappings().one()
            if owned:
                await session.commit()
        return _to_layout_version_row(row)
