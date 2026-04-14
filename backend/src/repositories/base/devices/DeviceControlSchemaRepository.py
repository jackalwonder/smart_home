from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from src.repositories.rows.index import DeviceControlSchemaRow
from src.shared.kernel.RepoContext import RepoContext


@dataclass(frozen=True)
class NewDeviceControlSchemaRow:
    device_id: str
    action_type: str
    target_scope: str | None
    target_key: str | None
    value_type: str
    value_range_json: dict | None
    allowed_values_json: list | None
    unit: str | None
    is_quick_action: bool
    requires_detail_entry: bool
    sort_order: int


class DeviceControlSchemaRepository(Protocol):
    async def list_by_device_id(
        self,
        device_id: str,
        ctx: RepoContext | None = None,
    ) -> list[DeviceControlSchemaRow]: ...

    async def replace_for_device(
        self,
        device_id: str,
        schemas: list[NewDeviceControlSchemaRow],
        ctx: RepoContext | None = None,
    ) -> None: ...
