from __future__ import annotations

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import session_scope
from src.repositories.base.editor.DraftHotspotRepository import DraftHotspotSnapshotRow
from src.repositories.rows.index import DraftHotspotRow
from src.shared.kernel.RepoContext import RepoContext


class DraftHotspotRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def list_by_draft_layout_id(
        self,
        draft_layout_id: str,
        ctx: RepoContext | None = None,
    ) -> list[DraftHotspotRow]:
        stmt = text(
            """
            SELECT
                id::text AS id,
                draft_layout_id::text AS draft_layout_id,
                hotspot_id,
                device_id::text AS device_id,
                x::float8 AS x,
                y::float8 AS y,
                icon_type,
                label_mode,
                is_visible,
                structure_order,
                updated_at::text AS updated_at
            FROM draft_hotspots
            WHERE draft_layout_id = :draft_layout_id
            ORDER BY structure_order ASC, hotspot_id ASC
            """
        )
        async with session_scope(self._database, ctx) as (session, _):
            rows = (
                await session.execute(stmt, {"draft_layout_id": draft_layout_id})
            ).mappings().all()
        return [
            DraftHotspotRow(
                id=row["id"],
                draft_layout_id=row["draft_layout_id"],
                hotspot_id=row["hotspot_id"],
                device_id=row["device_id"],
                x=row["x"],
                y=row["y"],
                icon_type=row["icon_type"],
                label_mode=row["label_mode"],
                is_visible=row["is_visible"],
                structure_order=row["structure_order"],
                updated_at=row["updated_at"],
            )
            for row in rows
        ]

    async def replace_for_draft_layout(
        self,
        draft_layout_id: str,
        hotspots: list[DraftHotspotSnapshotRow],
        ctx: RepoContext | None = None,
    ) -> None:
        async with session_scope(self._database, ctx) as (session, owned):
            await session.execute(
                text("DELETE FROM draft_hotspots WHERE draft_layout_id = :draft_layout_id"),
                {"draft_layout_id": draft_layout_id},
            )
            for hotspot in hotspots:
                await session.execute(
                    text(
                        """
                        INSERT INTO draft_hotspots (
                            draft_layout_id,
                            hotspot_id,
                            device_id,
                            x,
                            y,
                            icon_type,
                            label_mode,
                            is_visible,
                            structure_order
                        ) VALUES (
                            :draft_layout_id,
                            :hotspot_id,
                            :device_id,
                            :x,
                            :y,
                            :icon_type,
                            :label_mode,
                            :is_visible,
                            :structure_order
                        )
                        """
                    ),
                    {
                        "draft_layout_id": draft_layout_id,
                        "hotspot_id": hotspot.hotspot_id,
                        "device_id": hotspot.device_id,
                        "x": hotspot.x,
                        "y": hotspot.y,
                        "icon_type": hotspot.icon_type,
                        "label_mode": hotspot.label_mode,
                        "is_visible": hotspot.is_visible,
                        "structure_order": hotspot.structure_order,
                    },
                )
            if owned:
                await session.commit()
