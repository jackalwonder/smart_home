from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from src.shared.kernel.RepoContext import RepoContext


@dataclass(frozen=True)
class MediaBindingRow:
    id: str
    home_id: str
    device_id: str | None
    binding_status: str
    availability_status: str | None
    updated_at: str


@dataclass(frozen=True)
class MediaBindingUpsertRow:
    home_id: str
    device_id: str | None
    binding_status: str
    availability_status: str | None
    updated_by_member_id: str | None
    updated_by_terminal_id: str | None


class MediaBindingRepository(Protocol):
    async def find_by_home_id(
        self,
        home_id: str,
        ctx: RepoContext | None = None,
    ) -> MediaBindingRow | None: ...

    async def upsert(
        self,
        input: MediaBindingUpsertRow,
        ctx: RepoContext | None = None,
    ) -> MediaBindingRow: ...
