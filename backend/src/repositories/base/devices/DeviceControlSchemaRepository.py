from __future__ import annotations

from typing import Protocol

from src.repositories.rows.index import DeviceControlSchemaRow
from src.shared.kernel.RepoContext import RepoContext


class DeviceControlSchemaRepository(Protocol):
    async def list_by_device_id(
        self,
        device_id: str,
        ctx: RepoContext | None = None,
    ) -> list[DeviceControlSchemaRow]: ...
