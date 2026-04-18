from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from src.repositories.rows.index import TerminalRow
from src.shared.kernel.RepoContext import RepoContext


@dataclass(frozen=True)
class NewTerminalPairingSessionRow:
    terminal_id: str
    pairing_code_hash: str
    issued_at: str
    expires_at: str


@dataclass(frozen=True)
class TerminalPairingSessionRow:
    pairing_id: str
    home_id: str
    terminal_id: str
    terminal_code: str
    terminal_name: str
    terminal_mode: str
    pairing_code_hash: str
    issued_at: str
    expires_at: str
    claimed_at: str | None
    claimed_by_member_id: str | None
    claimed_by_terminal_id: str | None
    bootstrap_token_ciphertext: str | None
    bootstrap_token_expires_at: str | None
    completed_at: str | None
    invalidated_at: str | None


@dataclass(frozen=True)
class NewTerminalPairingAuditRow:
    home_id: str
    acting_terminal_id: str
    operator_id: str | None
    target_terminal_id: str
    action_type: str
    after_version: str | None
    result_status: str
    payload_json: dict[str, object | str | bool | int | float | None]
    created_at: str


class TerminalPairingCodeRepository(Protocol):
    async def find_terminal(
        self,
        home_id: str,
        terminal_id: str,
        ctx: RepoContext | None = None,
    ) -> TerminalRow | None: ...

    async def issue_for_terminal(
        self,
        input: NewTerminalPairingSessionRow,
        invalidated_at: str,
        ctx: RepoContext | None = None,
    ) -> TerminalPairingSessionRow: ...

    async def find_session_for_terminal(
        self,
        *,
        terminal_id: str,
        pairing_id: str,
        ctx: RepoContext | None = None,
    ) -> TerminalPairingSessionRow | None: ...

    async def find_active_by_code_hash(
        self,
        *,
        home_id: str,
        pairing_code_hash: str,
        now: str,
        ctx: RepoContext | None = None,
    ) -> TerminalPairingSessionRow | None: ...

    async def mark_claimed(
        self,
        *,
        pairing_id: str,
        claimed_at: str,
        claimed_by_member_id: str | None,
        claimed_by_terminal_id: str | None,
        bootstrap_token_ciphertext: str,
        bootstrap_token_expires_at: str,
        ctx: RepoContext | None = None,
    ) -> None: ...

    async def mark_completed(
        self,
        *,
        pairing_id: str,
        completed_at: str,
        clear_bootstrap_token: bool = True,
        ctx: RepoContext | None = None,
    ) -> None: ...

    async def insert_audit(
        self,
        input: NewTerminalPairingAuditRow,
        ctx: RepoContext | None = None,
    ) -> str: ...
