from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from src.repositories.rows.index import DraftLeaseRow
from src.shared.kernel.RepoContext import RepoContext


@dataclass(frozen=True)
class NewDraftLeaseRow:
    home_id: str
    lease_id: str
    terminal_id: str
    member_id: str | None
    lease_status: str
    is_active: bool
    lease_expires_at: str
    heartbeat_interval_seconds: int
    last_heartbeat_at: str
    taken_over_from_lease_id: str | None = None
    lost_reason: str | None = None


class DraftLeaseRepository(Protocol):
    async def find_active_by_home_id(
        self,
        home_id: str,
        ctx: RepoContext | None = None,
    ) -> DraftLeaseRow | None: ...

    async def find_by_lease_id(
        self,
        home_id: str,
        lease_id: str,
        ctx: RepoContext | None = None,
    ) -> DraftLeaseRow | None: ...

    async def insert(
        self,
        input: NewDraftLeaseRow,
        ctx: RepoContext | None = None,
    ) -> DraftLeaseRow: ...

    async def deactivate_lease(
        self,
        lease_id: str,
        next_status: str,
        lost_reason: str | None,
        ctx: RepoContext | None = None,
    ) -> None: ...

    async def heartbeat(
        self,
        lease_id: str,
        heartbeat_at: str,
        expires_at: str,
        ctx: RepoContext | None = None,
    ) -> int: ...
