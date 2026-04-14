from __future__ import annotations

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import session_scope
from src.repositories.base.settings.LayoutHotspotRepository import (
    LayoutHotspotSnapshotRow,
)
from src.shared.kernel.RepoContext import RepoContext


class LayoutHotspotRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def list_by_layout_version_id(
        self,
        layout_version_id: str,
        ctx: RepoContext | None = None,
    ) -> list[LayoutHotspotSnapshotRow]:
        stmt = text(
            """
            SELECT
                layout_version_id::text AS layout_version_id,
                hotspot_id,
                device_id::text AS device_id,
                x::float8 AS x,
                y::float8 AS y,
                icon_type,
                label_mode,
                is_visible,
                structure_order,
                display_policy::text AS display_policy
            FROM layout_hotspots
            WHERE layout_version_id = :layout_version_id
            ORDER BY structure_order ASC, created_at ASC
            """
        )
        async with session_scope(self._database, ctx) as (session, _):
            rows = (
                await session.execute(stmt, {"layout_version_id": layout_version_id})
            ).mappings().all()
        return [
            LayoutHotspotSnapshotRow(
                layout_version_id=row["layout_version_id"],
                hotspot_id=row["hotspot_id"],
                device_id=row["device_id"],
                x=row["x"],
                y=row["y"],
                icon_type=row["icon_type"],
                label_mode=row["label_mode"],
                is_visible=row["is_visible"],
                structure_order=row["structure_order"],
                display_policy=row["display_policy"],
            )
            for row in rows
        ]

    async def replace_for_layout_version(
        self,
        layout_version_id: str,
        hotspots: list[LayoutHotspotSnapshotRow],
        ctx: RepoContext | None = None,
    ) -> None:
        async with session_scope(self._database, ctx) as (session, owned):
            await session.execute(
                text("DELETE FROM layout_hotspots WHERE layout_version_id = :layout_version_id"),
                {"layout_version_id": layout_version_id},
            )
            for hotspot in hotspots:
                await session.execute(
                    text(
                        """
                        INSERT INTO layout_hotspots (
                            layout_version_id,
                            hotspot_id,
                            device_id,
                            x,
                            y,
                            icon_type,
                            label_mode,
                            is_visible,
                            structure_order,
                            display_policy
                        ) VALUES (
                            :layout_version_id,
                            :hotspot_id,
                            :device_id,
                            :x,
                            :y,
                            :icon_type,
                            :label_mode,
                            :is_visible,
                            :structure_order,
                            :display_policy
                        )
                        """
                    ),
                    {
                        "layout_version_id": layout_version_id,
                        "hotspot_id": hotspot.hotspot_id,
                        "device_id": hotspot.device_id,
                        "x": hotspot.x,
                        "y": hotspot.y,
                        "icon_type": hotspot.icon_type,
                        "label_mode": hotspot.label_mode,
                        "is_visible": hotspot.is_visible,
                        "structure_order": hotspot.structure_order,
                        "display_policy": hotspot.display_policy,
                    },
                )
            if owned:
                await session.commit()
