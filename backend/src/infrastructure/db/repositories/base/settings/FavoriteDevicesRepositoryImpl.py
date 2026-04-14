from __future__ import annotations

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import session_scope
from src.repositories.base.settings.FavoriteDevicesRepository import FavoriteDeviceSnapshotRow
from src.shared.kernel.RepoContext import RepoContext


class FavoriteDevicesRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def replace_for_settings_version(
        self,
        settings_version_id: str,
        favorites: list[FavoriteDeviceSnapshotRow],
        ctx: RepoContext | None = None,
    ) -> None:
        async with session_scope(self._database, ctx) as (session, owned):
            await session.execute(
                text("DELETE FROM favorite_devices WHERE settings_version_id = :settings_version_id"),
                {"settings_version_id": settings_version_id},
            )
            for favorite in favorites:
                await session.execute(
                    text(
                        """
                        INSERT INTO favorite_devices (
                            home_id,
                            settings_version_id,
                            device_id,
                            selected,
                            favorite_order
                        ) VALUES (
                            :home_id,
                            :settings_version_id,
                            :device_id,
                            :selected,
                            :favorite_order
                        )
                        """
                    ),
                    {
                        "home_id": favorite.home_id,
                        "settings_version_id": favorite.settings_version_id,
                        "device_id": favorite.device_id,
                        "selected": favorite.selected,
                        "favorite_order": favorite.favorite_order,
                    },
                )
            if owned:
                await session.commit()
