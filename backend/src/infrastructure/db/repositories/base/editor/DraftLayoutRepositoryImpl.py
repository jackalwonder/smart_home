from __future__ import annotations

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import as_dict, session_scope, to_jsonb
from src.repositories.base.editor.DraftLayoutRepository import DraftLayoutUpsertRow
from src.repositories.rows.index import DraftLayoutRow
from src.shared.kernel.RepoContext import RepoContext


def _to_draft_layout_row(row) -> DraftLayoutRow:
    return DraftLayoutRow(
        id=row["id"],
        home_id=row["home_id"],
        draft_version=row["draft_version"],
        base_layout_version=row["base_layout_version"],
        background_asset_id=row["background_asset_id"],
        layout_meta_json=as_dict(row["layout_meta_json"]),
        readonly_snapshot_json=as_dict(row["readonly_snapshot_json"])
        if row["readonly_snapshot_json"] is not None
        else None,
        updated_by_member_id=row["updated_by_member_id"],
        updated_by_terminal_id=row["updated_by_terminal_id"],
        updated_at=row["updated_at"],
    )


class DraftLayoutRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def find_by_home_id(
        self,
        home_id: str,
        ctx: RepoContext | None = None,
    ) -> DraftLayoutRow | None:
        stmt = text(
            """
            SELECT
                id::text AS id,
                home_id::text AS home_id,
                draft_version,
                base_layout_version,
                background_asset_id::text AS background_asset_id,
                layout_meta_json,
                readonly_snapshot_json,
                updated_by_member_id::text AS updated_by_member_id,
                updated_by_terminal_id::text AS updated_by_terminal_id,
                updated_at::text AS updated_at
            FROM draft_layouts
            WHERE home_id = :home_id
            """
        )
        async with session_scope(self._database, ctx) as (session, _):
            row = (await session.execute(stmt, {"home_id": home_id})).mappings().one_or_none()
        return _to_draft_layout_row(row) if row is not None else None

    async def upsert(
        self,
        input: DraftLayoutUpsertRow,
        ctx: RepoContext | None = None,
    ) -> DraftLayoutRow:
        stmt = text(
            """
            INSERT INTO draft_layouts (
                home_id,
                draft_version,
                base_layout_version,
                background_asset_id,
                layout_meta_json,
                readonly_snapshot_json,
                updated_by_member_id,
                updated_by_terminal_id,
                updated_at
            ) VALUES (
                :home_id,
                :draft_version,
                :base_layout_version,
                :background_asset_id,
                :layout_meta_json,
                :readonly_snapshot_json,
                :updated_by_member_id,
                :updated_by_terminal_id,
                now()
            )
            ON CONFLICT (home_id) DO UPDATE SET
                draft_version = EXCLUDED.draft_version,
                base_layout_version = EXCLUDED.base_layout_version,
                background_asset_id = EXCLUDED.background_asset_id,
                layout_meta_json = EXCLUDED.layout_meta_json,
                readonly_snapshot_json = EXCLUDED.readonly_snapshot_json,
                updated_by_member_id = EXCLUDED.updated_by_member_id,
                updated_by_terminal_id = EXCLUDED.updated_by_terminal_id,
                updated_at = now()
            RETURNING
                id::text AS id,
                home_id::text AS home_id,
                draft_version,
                base_layout_version,
                background_asset_id::text AS background_asset_id,
                layout_meta_json,
                readonly_snapshot_json,
                updated_by_member_id::text AS updated_by_member_id,
                updated_by_terminal_id::text AS updated_by_terminal_id,
                updated_at::text AS updated_at
            """
        )
        async with session_scope(self._database, ctx) as (session, owned):
            row = (
                await session.execute(
                    stmt,
                    {
                        "home_id": input.home_id,
                        "draft_version": input.draft_version,
                        "base_layout_version": input.base_layout_version,
                        "background_asset_id": input.background_asset_id,
                        "layout_meta_json": to_jsonb(as_dict(input.layout_meta_json)),
                        "readonly_snapshot_json": (
                            to_jsonb(input.readonly_snapshot_json)
                            if input.readonly_snapshot_json is not None
                            else None
                        ),
                        "updated_by_member_id": input.updated_by_member_id,
                        "updated_by_terminal_id": input.updated_by_terminal_id,
                    },
                )
            ).mappings().one()
            if owned:
                await session.commit()
        return _to_draft_layout_row(row)

    async def delete_by_home_id(
        self,
        home_id: str,
        ctx: RepoContext | None = None,
    ) -> None:
        async with session_scope(self._database, ctx) as (session, owned):
            await session.execute(text("DELETE FROM draft_layouts WHERE home_id = :home_id"), {"home_id": home_id})
            if owned:
                await session.commit()
