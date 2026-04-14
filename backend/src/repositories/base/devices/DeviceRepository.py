from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from src.repositories.rows.index import DeviceRow
from src.shared.kernel.RepoContext import RepoContext


@dataclass(frozen=True)
class DeviceListFilter:
    room_id: str | None = None
    device_type: str | None = None
    include_offline: bool | None = None
    keyword: str | None = None
    page: int | None = None
    page_size: int | None = None


@dataclass(frozen=True)
class DeviceMappingPatch:
    room_id: str | None = None
    device_type: str | None = None
    is_primary_device: bool | None = None
    source_meta_json: dict[str, Any] | None = None


class DeviceRepository(Protocol):
    async def find_by_id(
        self,
        home_id: str,
        device_id: str,
        ctx: RepoContext | None = None,
    ) -> DeviceRow | None: ...

    async def list_by_home(
        self,
        home_id: str,
        filter: DeviceListFilter,
        ctx: RepoContext | None = None,
    ) -> list[DeviceRow]: ...

    async def update_mapping(
        self,
        device_id: str,
        patch: DeviceMappingPatch,
        ctx: RepoContext | None = None,
    ) -> None: ...
