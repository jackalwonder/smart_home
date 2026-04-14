from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from src.repositories.rows.index import WsEventOutboxRow
from src.shared.kernel.RepoContext import RepoContext


@dataclass(frozen=True)
class NewWsEventOutboxRow:
    home_id: str
    event_id: str
    event_type: str
    change_domain: str
    snapshot_required: bool
    payload_json: dict[str, Any]
    occurred_at: str


class WsEventOutboxRepository(Protocol):
    async def insert(
        self,
        input: NewWsEventOutboxRow,
        ctx: RepoContext | None = None,
    ) -> WsEventOutboxRow: ...

    async def list_pending(
        self,
        limit: int,
        ctx: RepoContext | None = None,
    ) -> list[WsEventOutboxRow]: ...

    async def mark_dispatching(self, ids: list[str], ctx: RepoContext | None = None) -> None: ...
    async def mark_dispatched(self, id: str, ctx: RepoContext | None = None) -> None: ...
    async def mark_failed(self, id: str, ctx: RepoContext | None = None) -> None: ...
