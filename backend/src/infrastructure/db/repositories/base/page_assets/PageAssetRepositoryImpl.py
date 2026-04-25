from __future__ import annotations

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import session_scope
from src.repositories.base.page_assets.PageAssetRepository import (
    PageAssetFileRow,
    PageAssetWriteInput,
    PageAssetWriteRow,
)


class PageAssetRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def upsert_floorplan_asset(
        self,
        input: PageAssetWriteInput,
        *,
        replace_current: bool,
    ) -> PageAssetWriteRow:
        async with session_scope(self._database) as (session, owned):
            row = None
            if replace_current:
                current_asset_row = (
                    await session.execute(
                        text(
                            """
                            WITH current_asset AS (
                                SELECT
                                    background_asset_id::text AS asset_id,
                                    1 AS priority
                                FROM draft_layouts
                                WHERE home_id = :home_id
                                  AND background_asset_id IS NOT NULL
                                UNION ALL
                                SELECT
                                    background_asset_id::text AS asset_id,
                                    2 AS priority
                                FROM v_current_layout_versions
                                WHERE home_id = :home_id
                                  AND background_asset_id IS NOT NULL
                            )
                            SELECT asset_id
                            FROM current_asset
                            ORDER BY priority ASC
                            LIMIT 1
                            """
                        ),
                        {"home_id": input.home_id},
                    )
                ).mappings().one_or_none()
                if current_asset_row is not None:
                    row = (
                        await session.execute(
                            text(
                                """
                                UPDATE page_assets
                                SET
                                    file_url = :file_url,
                                    file_hash = :file_hash,
                                    width = :width,
                                    height = :height,
                                    mime_type = :mime_type,
                                    uploaded_by_member_id = :uploaded_by_member_id,
                                    uploaded_by_terminal_id = :uploaded_by_terminal_id,
                                    updated_at = now()
                                WHERE home_id = :home_id
                                  AND id::text = :asset_id
                                RETURNING id::text AS asset_id, updated_at::text AS updated_at
                                """
                            ),
                            {
                                **input.__dict__,
                                "asset_id": current_asset_row["asset_id"],
                            },
                        )
                    ).mappings().one_or_none()

            if row is None:
                row = (
                    await session.execute(
                        text(
                            """
                            INSERT INTO page_assets (
                                home_id,
                                asset_type,
                                file_url,
                                file_hash,
                                width,
                                height,
                                mime_type,
                                uploaded_by_member_id,
                                uploaded_by_terminal_id
                            ) VALUES (
                                :home_id,
                                'FLOORPLAN',
                                :file_url,
                                :file_hash,
                                :width,
                                :height,
                                :mime_type,
                                :uploaded_by_member_id,
                                :uploaded_by_terminal_id
                            )
                            RETURNING id::text AS asset_id, created_at::text AS updated_at
                            """
                        ),
                        input.__dict__,
                    )
                ).mappings().one()
            if owned:
                await session.commit()
        return PageAssetWriteRow(**dict(row))

    async def create_hotspot_icon_asset(
        self,
        input: PageAssetWriteInput,
    ) -> PageAssetWriteRow:
        stmt = text(
            """
            INSERT INTO page_assets (
                home_id,
                asset_type,
                file_url,
                file_hash,
                width,
                height,
                mime_type,
                uploaded_by_member_id,
                uploaded_by_terminal_id
            ) VALUES (
                :home_id,
                'HOTSPOT_ICON',
                :file_url,
                :file_hash,
                :width,
                :height,
                :mime_type,
                :uploaded_by_member_id,
                :uploaded_by_terminal_id
            )
            RETURNING id::text AS asset_id, created_at::text AS updated_at
            """
        )
        async with session_scope(self._database) as (session, owned):
            row = (await session.execute(stmt, input.__dict__)).mappings().one()
            if owned:
                await session.commit()
        return PageAssetWriteRow(**dict(row))

    async def find_asset_file(
        self,
        *,
        home_id: str,
        asset_id: str,
        asset_type: str,
    ) -> PageAssetFileRow | None:
        stmt = text(
            """
            SELECT file_url, mime_type
            FROM page_assets
            WHERE home_id = :home_id
              AND id::text = :asset_id
              AND asset_type = :asset_type
            """
        )
        async with session_scope(self._database) as (session, _):
            row = (
                await session.execute(
                    stmt,
                    {"home_id": home_id, "asset_id": asset_id, "asset_type": asset_type},
                )
            ).mappings().one_or_none()
        return PageAssetFileRow(**dict(row)) if row is not None else None
