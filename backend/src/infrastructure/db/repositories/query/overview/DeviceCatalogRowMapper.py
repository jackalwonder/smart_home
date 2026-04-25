from __future__ import annotations

from typing import Any

from src.repositories.query.overview.DeviceCatalogQueryRepository import (
    DeviceCatalogBadgeRow,
    DeviceCatalogDetailRow,
    DeviceCatalogDetailSnapshot,
    DeviceCatalogFavoriteRow,
    DeviceCatalogListRow,
    DeviceCatalogListSnapshot,
    DeviceCatalogPanelRow,
    DeviceCatalogPanelSnapshot,
    DeviceCatalogRoomRow,
    DeviceControlSchemaQueryRow,
    DeviceEditorHotspotQueryRow,
    DeviceEntityLinkQueryRow,
)


def badge_map(rows: list[Any]) -> dict[str, list[DeviceCatalogBadgeRow]]:
    result: dict[str, list[DeviceCatalogBadgeRow]] = {}
    for row in rows:
        result.setdefault(row["device_id"], []).append(
            DeviceCatalogBadgeRow(
                code=row["code"],
                level=row["level"],
                text=row["text"],
            )
        )
    return result


def favorite_rows(rows: list[Any]) -> list[DeviceCatalogFavoriteRow]:
    return [
        DeviceCatalogFavoriteRow(
            device_id=row["device_id"],
            selected=bool(row["selected"]),
            favorite_order=row["favorite_order"],
        )
        for row in rows
    ]


def list_rows(rows: list[Any]) -> list[DeviceCatalogListRow]:
    return [DeviceCatalogListRow(**dict(row)) for row in rows]


def room_rows(rows: list[Any]) -> list[DeviceCatalogRoomRow]:
    return [DeviceCatalogRoomRow(**dict(row)) for row in rows]


def panel_rows(rows: list[Any]) -> list[DeviceCatalogPanelRow]:
    return [DeviceCatalogPanelRow(**dict(row)) for row in rows]


def detail_snapshot(
    *,
    device_row: Any | None,
    badge_rows: list[Any],
    schema_rows: list[Any],
    entity_link_rows: list[Any],
    hotspot_rows: list[Any] | None,
) -> DeviceCatalogDetailSnapshot:
    if device_row is None:
        return DeviceCatalogDetailSnapshot(device=None)
    return DeviceCatalogDetailSnapshot(
        device=DeviceCatalogDetailRow(**dict(device_row)),
        badges=[DeviceCatalogBadgeRow(**dict(badge)) for badge in badge_rows],
        control_schema=[
            DeviceControlSchemaQueryRow(**dict(schema)) for schema in schema_rows
        ],
        entity_links=[
            DeviceEntityLinkQueryRow(**dict(entity)) for entity in entity_link_rows
        ],
        editor_hotspots=[
            DeviceEditorHotspotQueryRow(**dict(hotspot)) for hotspot in hotspot_rows
        ]
        if hotspot_rows is not None
        else None,
    )


def list_snapshot(
    *,
    favorites: list[DeviceCatalogFavoriteRow],
    media_device_id: str | None,
    devices: list[DeviceCatalogListRow],
    badges: dict[str, list[DeviceCatalogBadgeRow]],
) -> DeviceCatalogListSnapshot:
    return DeviceCatalogListSnapshot(
        favorites=favorites,
        media_device_id=media_device_id,
        devices=devices,
        badge_map=badges,
    )


def panel_snapshot(
    *,
    favorites: list[DeviceCatalogFavoriteRow],
    media_device_id: str | None,
    low_battery_threshold: float,
    devices: list[DeviceCatalogPanelRow],
    badges: dict[str, list[DeviceCatalogBadgeRow]],
) -> DeviceCatalogPanelSnapshot:
    return DeviceCatalogPanelSnapshot(
        favorites=favorites,
        media_device_id=media_device_id,
        low_battery_threshold=low_battery_threshold,
        devices=devices,
        badge_map=badges,
    )
