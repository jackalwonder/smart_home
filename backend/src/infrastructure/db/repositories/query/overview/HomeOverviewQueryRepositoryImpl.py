from __future__ import annotations

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import session_scope
from src.infrastructure.db.repositories.query.overview.HomeOverviewQuerySql import (
    ACTIVE_BADGES_SQL,
    CURRENT_LAYOUT_SQL,
    CURRENT_SETTINGS_SQL,
    ENERGY_SUMMARY_SQL,
    FAVORITE_DEVICE_ROWS_SQL,
    FAVORITES_SQL,
    FUNCTION_SETTINGS_SQL,
    HOMEPAGE_DEVICES_SQL,
    HOTSPOTS_SQL,
    MEDIA_BINDING_SQL,
    PAGE_SETTINGS_SQL,
    SYSTEM_CONNECTION_SQL,
)
from src.infrastructure.db.repositories.query.overview.HomeOverviewSnapshotAssembler import (
    assemble_home_overview,
    build_badge_map,
)
from src.repositories.query.overview.types import HomeOverviewReadModel
from src.shared.kernel.RepoContext import RepoContext


class HomeOverviewQueryRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def get_overview_context(
        self,
        home_id: str,
        ctx: RepoContext | None = None,
    ) -> HomeOverviewReadModel:
        async with session_scope(self._database, ctx) as (session, _):
            layout_row = (
                await session.execute(CURRENT_LAYOUT_SQL, {"home_id": home_id})
            ).mappings().one()

            hotspot_rows = (
                await session.execute(
                    HOTSPOTS_SQL,
                    {"layout_version_id": layout_row["id"]},
                )
            ).mappings().all()

            device_rows = (
                await session.execute(HOMEPAGE_DEVICES_SQL, {"home_id": home_id})
            ).mappings().all()

            settings_row = (
                await session.execute(CURRENT_SETTINGS_SQL, {"home_id": home_id})
            ).mappings().one_or_none()

            page_settings_row = None
            function_settings_row = None
            favorite_rows = []
            if settings_row is not None:
                settings_params = {"settings_version_id": settings_row["id"]}
                page_settings_row = (
                    await session.execute(PAGE_SETTINGS_SQL, settings_params)
                ).mappings().one_or_none()
                function_settings_row = (
                    await session.execute(FUNCTION_SETTINGS_SQL, settings_params)
                ).mappings().one_or_none()
                favorite_rows = (
                    await session.execute(FAVORITES_SQL, settings_params)
                ).mappings().all()

            selected_favorite_rows = [row for row in favorite_rows if row["selected"]]
            favorite_order_map = {
                row["device_id"]: row["favorite_order"] for row in selected_favorite_rows
            }
            favorite_device_rows = []
            if favorite_order_map:
                favorite_device_rows = (
                    await session.execute(
                        FAVORITE_DEVICE_ROWS_SQL,
                        {
                            "home_id": home_id,
                            "favorite_device_ids": list(favorite_order_map.keys()),
                        },
                    )
                ).mappings().all()

            badge_map = {}
            badge_device_ids = sorted(
                {row["device_id"] for row in device_rows}
                | {row["device_id"] for row in favorite_device_rows}
            )
            if badge_device_ids:
                badge_rows = (
                    await session.execute(
                        ACTIVE_BADGES_SQL,
                        {"device_ids": badge_device_ids},
                    )
                ).mappings().all()
                badge_map = build_badge_map(list(badge_rows))

            energy_row = (
                await session.execute(ENERGY_SUMMARY_SQL, {"home_id": home_id})
            ).mappings().one_or_none()
            media_row = (
                await session.execute(MEDIA_BINDING_SQL, {"home_id": home_id})
            ).mappings().one_or_none()
            system_connection_row = (
                await session.execute(SYSTEM_CONNECTION_SQL, {"home_id": home_id})
            ).mappings().one_or_none()

        return assemble_home_overview(
            layout_row=layout_row,
            settings_row=settings_row,
            hotspot_rows=list(hotspot_rows),
            device_rows=list(device_rows),
            favorite_rows=list(favorite_rows),
            favorite_device_rows=list(favorite_device_rows),
            favorite_order_map=favorite_order_map,
            badge_map=badge_map,
            page_settings_row=page_settings_row,
            function_settings_row=function_settings_row,
            energy_row=energy_row,
            media_row=media_row,
            system_connection_row=system_connection_row,
        )
