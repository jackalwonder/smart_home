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


@dataclass(frozen=True)
class TerminalBootstrapTokenSummaryRow:
    terminal_id: str
    terminal_code: str
    terminal_name: str
    terminal_mode: str
    token_configured: bool
    issued_at: str | None
    expires_at: str | None
    last_used_at: str | None


@dataclass(frozen=True)
class NewTerminalBootstrapTokenAuditRow:
    home_id: str
    acting_terminal_id: str
    operator_id: str | None
    target_terminal_id: str
    action_type: str
    before_version: str | None
    after_version: str | None
    result_status: str
    payload_json: dict[str, object | str | bool | int | float | None]
    created_at: str


@dataclass(frozen=True)
class TerminalBootstrapTokenAuditRow:
    audit_id: str
    terminal_id: str
    terminal_code: str
    terminal_name: str
    action_type: str
    operator_id: str | None
    operator_name: str | None
    acting_terminal_id: str | None
    acting_terminal_name: str | None
    before_version: str | None
    after_version: str | None
    result_status: str
    expires_at: str | None
    rotated: bool | None
    created_at: str


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

    async def find_active_for_terminal(
        self,
        *,
        home_id: str,
        terminal_id: str,
        now: str,
        ctx: RepoContext | None = None,
    ) -> TerminalBootstrapTokenRow | None: ...

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

    async def list_terminal_summaries(
        self,
        *,
        home_id: str,
        now: str,
        ctx: RepoContext | None = None,
    ) -> list[TerminalBootstrapTokenSummaryRow]: ...

    async def insert_audit(
        self,
        input: NewTerminalBootstrapTokenAuditRow,
        ctx: RepoContext | None = None,
    ) -> str: ...

    async def list_audits(
        self,
        *,
        home_id: str,
        limit: int,
        ctx: RepoContext | None = None,
    ) -> list[TerminalBootstrapTokenAuditRow]: ...
