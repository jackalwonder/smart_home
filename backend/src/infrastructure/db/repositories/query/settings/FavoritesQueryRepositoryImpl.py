from __future__ import annotations

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import session_scope
from src.repositories.query.settings.FavoritesQueryRepository import (
    FavoriteDeviceRow,
    FavoriteFunctionSettingsRow,
    FavoriteSelectionRow,
    FavoriteSettingsRow,
    FavoritesQuerySnapshot,
)


class FavoritesQueryRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def get_snapshot(self, home_id: str) -> FavoritesQuerySnapshot:
        async with session_scope(self._database) as (session, _):
            settings_row = (
                await session.execute(
                    text(
                        """
                        SELECT
                            id::text AS id,
                            settings_version
                        FROM v_current_settings_versions
                        WHERE home_id = :home_id
                        """
                    ),
                    {"home_id": home_id},
                )
            ).mappings().one_or_none()

            function_row = None
            favorite_rows = []
            if settings_row is not None:
                function_row = (
                    await session.execute(
                        text(
                            """
                            SELECT favorite_limit
                            FROM function_settings
                            WHERE settings_version_id = :settings_version_id
                            """
                        ),
                        {"settings_version_id": settings_row["id"]},
                    )
                ).mappings().one_or_none()
                favorite_rows = (
                    await session.execute(
                        text(
                            """
                            SELECT
                                device_id::text AS device_id,
                                selected,
                                favorite_order
                            FROM favorite_devices
                            WHERE settings_version_id = :settings_version_id
                            """
                        ),
                        {"settings_version_id": settings_row["id"]},
                    )
                ).mappings().all()

            media_row = (
                await session.execute(
                    text(
                        """
                        SELECT device_id::text AS device_id
                        FROM media_bindings
                        WHERE home_id = :home_id
                          AND binding_status = 'MEDIA_SET'
                        """
                    ),
                    {"home_id": home_id},
                )
            ).mappings().one_or_none()

            device_rows = (
                await session.execute(
                    text(
                        """
                        SELECT
                            d.id::text AS device_id,
                            d.display_name,
                            d.device_type,
                            d.room_id::text AS room_id,
                            r.room_name,
                            d.is_readonly_device
                        FROM devices d
                        LEFT JOIN rooms r
                          ON r.id = d.room_id
                        WHERE d.home_id = :home_id
                        ORDER BY d.display_name ASC, d.id ASC
                        """
                    ),
                    {"home_id": home_id},
                )
            ).mappings().all()

        return FavoritesQuerySnapshot(
            settings=FavoriteSettingsRow(**dict(settings_row))
            if settings_row is not None
            else None,
            function_settings=FavoriteFunctionSettingsRow(
                favorite_limit=int(function_row["favorite_limit"])
            )
            if function_row is not None
            else None,
            favorites=[
                FavoriteSelectionRow(
                    device_id=row["device_id"],
                    selected=bool(row["selected"]),
                    favorite_order=row["favorite_order"],
                )
                for row in favorite_rows
            ],
            media_device_id=media_row["device_id"] if media_row is not None else None,
            devices=[
                FavoriteDeviceRow(
                    device_id=row["device_id"],
                    display_name=row["display_name"],
                    device_type=row["device_type"],
                    room_id=row["room_id"],
                    room_name=row["room_name"],
                    is_readonly_device=bool(row["is_readonly_device"]),
                )
                for row in device_rows
            ],
        )
