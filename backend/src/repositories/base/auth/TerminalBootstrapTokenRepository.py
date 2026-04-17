from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from src.repositories.rows.index import TerminalRow
from src.shared.kernel.RepoContext import RepoContext


@dataclass(frozen=True)
class NewTerminalBootstrapTokenRow:
    terminal_id: str
    token_hash: str
    token_jti: str
    issued_at: str
    expires_at: str
    created_by_member_id: str | None = None
    created_by_terminal_id: str | None = None


@dataclass(frozen=True)
class TerminalBootstrapTokenRow:
    id: str
    home_id: str
    terminal_id: str
    terminal_mode: str
    token_jti: str
    issued_at: str
    expires_at: str
    last_used_at: str | None
    revoked_at: str | None


@dataclass(frozen=True)
class RotatedTerminalBootstrapToken:
    token: TerminalBootstrapTokenRow
    revoked_count: int


class TerminalBootstrapTokenRepository(Protocol):
    async def find_terminal(
        self,
        home_id: str,
        terminal_id: str,
        ctx: RepoContext | None = None,
    ) -> TerminalRow | None: ...

    async def rotate_for_terminal(
        self,
        input: NewTerminalBootstrapTokenRow,
        revoked_at: str,
        ctx: RepoContext | None = None,
    ) -> RotatedTerminalBootstrapToken: ...

    async def find_usable(
        self,
        *,
        token_jti: str,
        token_hash: str,
        home_id: str,
        terminal_id: str,
        now: str,
        ctx: RepoContext | None = None,
    ) -> TerminalBootstrapTokenRow | None: ...

    async def mark_used(
        self,
        token_id: str,
        used_at: str,
        ctx: RepoContext | None = None,
    ) -> None: ...
