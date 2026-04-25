from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from src.shared.kernel.RepoContext import RepoContext


@dataclass(frozen=True)
class DeviceMappingSavedRow:
    device_id: str
    room_id: str | None
    device_type: str | None
    is_primary_device: bool
    default_control_target: str | None
    updated_at: str


class DeviceCatalogCommandRepository(Protocol):
    async def room_exists(
        self,
        *,
        home_id: str,
        room_id: str,
        ctx: RepoContext | None = None,
    ) -> bool: ...

    async def get_mapping_saved_row(
        self,
        *,
        home_id: str,
        device_id: str,
        ctx: RepoContext | None = None,
    ) -> DeviceMappingSavedRow: ...
