from __future__ import annotations

from typing import Any

from src.infrastructure.db.repositories._support import as_dict
from src.repositories.base.system.HaEntitySyncRepository import RuntimeEntityLinkRow


def room_id_by_name(rows: list[Any]) -> dict[str, str]:
    return {str(row["room_name"]): str(row["id"]) for row in rows}


def device_id_by_ha_device_id(rows: list[Any]) -> dict[str, str]:
    return {
        str(row["ha_device_id"]): str(row["id"])
        for row in rows
        if row["ha_device_id"] is not None
    }


def entity_row_id_by_entity_id(rows: list[Any]) -> dict[str, str]:
    return {str(row["entity_id"]): str(row["id"]) for row in rows}


def runtime_entity_links(rows: list[Any]) -> list[RuntimeEntityLinkRow]:
    return [
        RuntimeEntityLinkRow(
            device_id=str(row["device_id"]),
            home_id=str(row["home_id"]),
            display_name=str(row["display_name"]),
            device_type=str(row["device_type"]),
            entity_id=str(row["entity_id"]),
            domain=str(row["domain"]),
            state=row["state"],
            attributes_json=as_dict(row["attributes_json"]),
            last_state_changed_at=row["last_state_changed_at"],
            is_primary=bool(row["is_primary"]),
            sort_order=int(row["sort_order"]),
        )
        for row in rows
    ]
