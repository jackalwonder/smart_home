from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from src.modules.auth.services.command.BootstrapTokenService import (
    BootstrapTokenCreateInput,
    BootstrapTokenStatusInput,
    BootstrapTokenService,
)
from src.modules.auth.services.query.BootstrapTokenResolver import JwtBootstrapTokenResolver
from src.repositories.base.auth.TerminalBootstrapTokenRepository import (
    NewTerminalBootstrapTokenAuditRow,
    RotatedTerminalBootstrapToken,
    TerminalBootstrapTokenRow,
    TerminalBootstrapTokenAuditRow,
    TerminalBootstrapTokenSummaryRow,
)
from src.repositories.rows.index import TerminalRow
from src.shared.errors.AppError import AppError


class _Clock:
    def now(self):
        return datetime(2026, 4, 18, 0, 0, 0, tzinfo=timezone.utc)


class _Repository:
    def __init__(self):
        self.terminal = TerminalRow(
            id="terminal-1",
            home_id="home-1",
            terminal_code="main",
            terminal_mode="KIOSK",
            terminal_name="Main",
        )
        self.saved_hash = None
        self.saved_jti = None
        self.used_token_id = None
        self.audit_rows = []

    async def find_terminal(self, home_id, terminal_id, ctx=None):
        if home_id == "home-1" and terminal_id == "terminal-1":
            return self.terminal
        return None

    async def rotate_for_terminal(self, input, revoked_at, ctx=None):
        self.saved_hash = input.token_hash
        self.saved_jti = input.token_jti
        return RotatedTerminalBootstrapToken(
            token=TerminalBootstrapTokenRow(
                id="token-row-1",
                home_id="home-1",
                terminal_id=input.terminal_id,
                terminal_mode="KIOSK",
                token_jti=input.token_jti,
                issued_at=input.issued_at,
                expires_at=input.expires_at,
                last_used_at=None,
                revoked_at=None,
            ),
            revoked_count=1,
        )

    async def find_active_for_terminal(self, *, home_id, terminal_id, now, ctx=None):
        if home_id == "home-1" and terminal_id == "terminal-1" and self.saved_jti is not None:
            expires_at = (datetime.fromisoformat(now) + timedelta(hours=1)).isoformat()
            return TerminalBootstrapTokenRow(
                id="token-row-1",
                home_id=home_id,
                terminal_id=terminal_id,
                terminal_mode="KIOSK",
                token_jti=self.saved_jti,
                issued_at=now,
                expires_at=expires_at,
                last_used_at=None,
                revoked_at=None,
            )
        return None

    async def list_terminal_summaries(self, *, home_id, now, ctx=None):
        if home_id != "home-1":
            return []
        return [
            TerminalBootstrapTokenSummaryRow(
                terminal_id="terminal-1",
                terminal_code="main",
                terminal_name="Main",
                terminal_mode="KIOSK",
                token_configured=self.saved_jti is not None,
                issued_at=now if self.saved_jti is not None else None,
                expires_at=(datetime.fromisoformat(now) + timedelta(hours=1)).isoformat()
                if self.saved_jti is not None
                else None,
                last_used_at=None,
            )
        ]

    async def insert_audit(self, input: NewTerminalBootstrapTokenAuditRow, ctx=None):
        self.audit_rows.append(input)
        return "audit-1"

    async def list_audits(self, *, home_id, limit, ctx=None):
        if home_id != "home-1":
            return []
        return [
            TerminalBootstrapTokenAuditRow(
                audit_id="audit-1",
                terminal_id="terminal-1",
                terminal_code="main",
                terminal_name="Main",
                action_type="TERMINAL_BOOTSTRAP_TOKEN_RESET",
                operator_id="member-1",
                operator_name="Owner",
                acting_terminal_id="terminal-1",
                acting_terminal_name="Main",
                before_version="active_token",
                after_version=self.saved_jti,
                result_status="SUCCESS",
                expires_at=(datetime(2026, 4, 18, 1, 0, 0, tzinfo=timezone.utc)).isoformat(),
                rotated=True,
                created_at=datetime(2026, 4, 18, 0, 0, 0, tzinfo=timezone.utc).isoformat(),
            )
        ][:limit]

    async def find_usable(self, *, token_jti, token_hash, home_id, terminal_id, now, ctx=None):
        if (
            token_jti == self.saved_jti
            and token_hash == self.saved_hash
            and home_id == "home-1"
            and terminal_id == "terminal-1"
        ):
            return TerminalBootstrapTokenRow(
                id="token-row-1",
                home_id=home_id,
                terminal_id=terminal_id,
                terminal_mode="KIOSK",
                token_jti=token_jti,
                issued_at=now,
                expires_at=now,
                last_used_at=None,
                revoked_at=None,
            )
        return None

    async def mark_used(self, token_id, used_at, ctx=None):
        self.used_token_id = token_id


def _service(repository: _Repository) -> BootstrapTokenService:
    return BootstrapTokenService(
        repository=repository,
        resolver=JwtBootstrapTokenResolver(
            secret="unit-test-bootstrap-secret",
            issuer="smart-home-backend",
            audience="smart-home-web-app",
            ttl_seconds=3600,
        ),
        clock=_Clock(),
    )


@pytest.mark.asyncio
async def test_create_or_reset_token_can_be_exchanged():
    repository = _Repository()
    service = _service(repository)

    created = await service.create_or_reset(
        BootstrapTokenCreateInput(
            home_id="home-1",
            target_terminal_id="terminal-1",
            created_by_member_id="member-1",
            created_by_terminal_id="terminal-1",
        )
    )
    exchanged = await service.exchange(created.bootstrap_token)

    assert created.terminal_id == "terminal-1"
    assert created.rotated is True
    assert created.scope == ["bootstrap:session"]
    assert repository.audit_rows[0].action_type == "TERMINAL_BOOTSTRAP_TOKEN_RESET"
    assert exchanged.home_id == "home-1"
    assert exchanged.terminal_id == "terminal-1"
    assert exchanged.bootstrap_token_jti == repository.saved_jti
    assert repository.used_token_id == "token-row-1"


@pytest.mark.asyncio
async def test_create_or_reset_unknown_terminal_returns_not_found():
    service = _service(_Repository())

    with pytest.raises(AppError) as exc_info:
        await service.create_or_reset(
            BootstrapTokenCreateInput(
                home_id="home-1",
                target_terminal_id="unknown-terminal",
                created_by_member_id=None,
                created_by_terminal_id="terminal-1",
            )
        )

    assert exc_info.value.code == "NOT_FOUND"


@pytest.mark.asyncio
async def test_get_status_returns_active_token_metadata():
    repository = _Repository()
    service = _service(repository)
    created = await service.create_or_reset(
        BootstrapTokenCreateInput(
            home_id="home-1",
            target_terminal_id="terminal-1",
            created_by_member_id="member-1",
            created_by_terminal_id="terminal-1",
        )
    )

    status = await service.get_status(
        BootstrapTokenStatusInput(
            home_id="home-1",
            target_terminal_id="terminal-1",
        )
    )

    assert status.terminal_id == "terminal-1"
    assert status.terminal_mode == "KIOSK"
    assert status.token_configured is True
    assert status.expires_at == created.expires_at


@pytest.mark.asyncio
async def test_get_status_unknown_terminal_returns_not_found():
    service = _service(_Repository())

    with pytest.raises(AppError) as exc_info:
        await service.get_status(
            BootstrapTokenStatusInput(
                home_id="home-1",
                target_terminal_id="unknown-terminal",
            )
        )

    assert exc_info.value.code == "NOT_FOUND"


@pytest.mark.asyncio
async def test_list_terminals_and_audits_return_repo_views():
    repository = _Repository()
    service = _service(repository)
    await service.create_or_reset(
        BootstrapTokenCreateInput(
            home_id="home-1",
            target_terminal_id="terminal-1",
            created_by_member_id="member-1",
            created_by_terminal_id="terminal-1",
        )
    )

    terminals = await service.list_terminals(home_id="home-1")
    audits = await service.list_audits(home_id="home-1", limit=20)

    assert terminals[0].terminal_code == "main"
    assert terminals[0].token_configured is True
    assert audits[0].action_type == "TERMINAL_BOOTSTRAP_TOKEN_RESET"
    assert audits[0].terminal_name == "Main"
