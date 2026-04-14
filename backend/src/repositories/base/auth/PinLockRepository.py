from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from src.repositories.rows.index import PinLockRow
from src.shared.kernel.RepoContext import RepoContext


@dataclass(frozen=True)
class PinFailureUpsert:
    home_id: str
    terminal_id: str
    failed_attempts: int
    locked_until: str | None
    last_failed_at: str


class PinLockRepository(Protocol):
    async def find_by_home_and_terminal(
        self,
        home_id: str,
        terminal_id: str,
        ctx: RepoContext | None = None,
    ) -> PinLockRow | None: ...

    async def upsert_failure(
        self,
        input: PinFailureUpsert,
        ctx: RepoContext | None = None,
    ) -> PinLockRow: ...

    async def clear_failures(
        self,
        home_id: str,
        terminal_id: str,
        ctx: RepoContext | None = None,
    ) -> None: ...
