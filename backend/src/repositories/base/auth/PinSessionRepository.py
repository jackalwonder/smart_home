from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from src.repositories.rows.index import PinSessionRow
from src.shared.kernel.RepoContext import RepoContext


@dataclass(frozen=True)
class NewPinSessionRow:
    home_id: str
    terminal_id: str
    member_id: str | None
    verified_for_action: str | None
    session_token_hash: str
    verified_at: str
    expires_at: str


class PinSessionRepository(Protocol):
    async def find_active_by_home_and_terminal(
        self,
        home_id: str,
        terminal_id: str,
        ctx: RepoContext | None = None,
    ) -> PinSessionRow | None: ...

    async def insert(
        self,
        input: NewPinSessionRow,
        ctx: RepoContext | None = None,
    ) -> PinSessionRow: ...

    async def deactivate_active_by_home_and_terminal(
        self,
        home_id: str,
        terminal_id: str,
        ctx: RepoContext | None = None,
    ) -> int: ...

    async def mark_expired_before(
        self,
        now: str,
        ctx: RepoContext | None = None,
    ) -> int: ...
