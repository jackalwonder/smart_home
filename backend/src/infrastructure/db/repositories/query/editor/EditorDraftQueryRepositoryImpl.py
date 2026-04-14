from __future__ import annotations

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import session_scope
from src.repositories.read_models.index import DraftLeaseReadModel, EditorDraftReadModel
from src.shared.kernel.RepoContext import RepoContext


class EditorDraftQueryRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def get_draft_context(
        self,
        home_id: str,
        ctx: RepoContext | None = None,
    ) -> EditorDraftReadModel | None:
        async with session_scope(self._database, ctx) as (session, _):
            draft = (
                await session.execute(
                    text(
                        """
                        SELECT
                            id::text AS id,
                            home_id::text AS home_id,
                            draft_version,
                            base_layout_version,
                            background_asset_id::text AS background_asset_id,
                            layout_meta_json
                        FROM draft_layouts
                        WHERE home_id = :home_id
                        """
                    ),
                    {"home_id": home_id},
                )
            ).mappings().one_or_none()
            if draft is None:
                return None
            hotspot_rows = (
                await session.execute(
                    text(
                        """
                        SELECT
                            hotspot_id,
                            device_id::text AS device_id,
                            x::float8 AS x,
                            y::float8 AS y,
                            icon_type,
                            label_mode,
                            is_visible,
                            structure_order
                        FROM draft_hotspots
                        WHERE draft_layout_id = :draft_layout_id
                        ORDER BY structure_order ASC, hotspot_id ASC
                        """
                    ),
                    {"draft_layout_id": draft["id"]},
                )
            ).mappings().all()
            lease = (
                await session.execute(
                    text(
                        """
                        SELECT
                            lease_id,
                            terminal_id::text AS terminal_id,
                            member_id::text AS member_id,
                            lease_status::text AS lease_status,
                            is_active,
                            lease_expires_at::text AS lease_expires_at,
                            last_heartbeat_at::text AS last_heartbeat_at
                        FROM draft_leases
                        WHERE home_id = :home_id
                          AND is_active = true
                        ORDER BY created_at DESC
                        LIMIT 1
                        """
                    ),
                    {"home_id": home_id},
                )
            ).mappings().one_or_none()

        return EditorDraftReadModel(
            draft_id=draft["id"],
            home_id=draft["home_id"],
            draft_version=draft["draft_version"],
            base_layout_version=draft["base_layout_version"],
            background_asset_id=draft["background_asset_id"],
            layout_meta=draft["layout_meta_json"] if isinstance(draft["layout_meta_json"], dict) else {},
            hotspots=[
                {
                    "hotspot_id": row["hotspot_id"],
                    "device_id": row["device_id"],
                    "x": row["x"],
                    "y": row["y"],
                    "icon_type": row["icon_type"],
                    "label_mode": row["label_mode"],
                    "is_visible": row["is_visible"],
                    "structure_order": row["structure_order"],
                }
                for row in hotspot_rows
            ],
            active_lease=DraftLeaseReadModel(
                lease_id=lease["lease_id"],
                terminal_id=lease["terminal_id"],
                member_id=lease["member_id"],
                lease_status=lease["lease_status"],
                is_active=lease["is_active"],
                lease_expires_at=lease["lease_expires_at"],
                last_heartbeat_at=lease["last_heartbeat_at"],
            )
            if lease is not None
            else None,
        )
