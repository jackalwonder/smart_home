from __future__ import annotations

from datetime import datetime, timezone

import pytest

from src.infrastructure.security.impl.FernetConnectionSecretCipher import (
    FernetConnectionSecretCipher,
)
from src.modules.auth.services.command.BootstrapTokenService import (
    BootstrapTokenCreateView,
)
from src.modules.auth.services.command.TerminalPairingCodeService import (
    TerminalPairingClaimInput,
    TerminalPairingCodeService,
    TerminalPairingIssueInput,
    TerminalPairingPollInput,
)
from src.modules.auth.services.query.BootstrapTokenResolver import JwtBootstrapTokenResolver
from src.repositories.base.auth.TerminalPairingCodeRepository import (
    NewTerminalPairingAuditRow,
    NewTerminalPairingSessionRow,
    TerminalPairingSessionRow,
)
from src.repositories.rows.index import TerminalRow
from src.shared.errors.AppError import AppError


class _Clock:
    def now(self):
        return datetime(2026, 4, 18, 0, 0, 0, tzinfo=timezone.utc)


class _BootstrapTokenService:
    async def create_or_reset(self, _input):
        return BootstrapTokenCreateView(
            terminal_id="terminal-1",
            bootstrap_token="bootstrap-token-1",
            expires_at="2026-05-18T00:00:00+00:00",
            rotated=True,
            scope=["bootstrap:session"],
        )


class _Repository:
    def __init__(self):
        self.terminal = TerminalRow(
            id="terminal-1",
            home_id="home-1",
            terminal_code="main",
            terminal_mode="KIOSK",
            terminal_name="Main terminal",
        )
        self.issued_row: TerminalPairingSessionRow | None = None
        self.claimed_bootstrap_token_ciphertext: str | None = None
        self.audits: list[NewTerminalPairingAuditRow] = []
        self.completed_pairing_id: str | None = None

    async def find_terminal(self, home_id, terminal_id, ctx=None):
        if home_id == "home-1" and terminal_id == "terminal-1":
            return self.terminal
        return None

    async def issue_for_terminal(
        self,
        input: NewTerminalPairingSessionRow,
        invalidated_at: str,
        ctx=None,
    ):
        self.issued_row = TerminalPairingSessionRow(
            pairing_id="pairing-1",
            home_id="home-1",
            terminal_id=input.terminal_id,
            terminal_code="main",
            terminal_name="Main terminal",
            terminal_mode="KIOSK",
            pairing_code_hash=input.pairing_code_hash,
            issued_at=input.issued_at,
            expires_at=input.expires_at,
            claimed_at=None,
            claimed_by_member_id=None,
            claimed_by_terminal_id=None,
            bootstrap_token_ciphertext=None,
            bootstrap_token_expires_at=None,
            completed_at=None,
            invalidated_at=None,
        )
        return self.issued_row

    async def find_session_for_terminal(self, *, terminal_id, pairing_id, ctx=None):
        if (
            self.issued_row is not None
            and self.issued_row.terminal_id == terminal_id
            and self.issued_row.pairing_id == pairing_id
        ):
            return TerminalPairingSessionRow(
                **{
                    **self.issued_row.__dict__,
                    "claimed_at": "2026-04-18T00:01:00+00:00"
                    if self.claimed_bootstrap_token_ciphertext
                    else None,
                    "bootstrap_token_ciphertext": self.claimed_bootstrap_token_ciphertext,
                    "bootstrap_token_expires_at": "2026-05-18T00:00:00+00:00"
                    if self.claimed_bootstrap_token_ciphertext
                    else None,
                    "completed_at": None,
                }
            )
        return None

    async def find_active_by_code_hash(self, *, home_id, pairing_code_hash, now, ctx=None):
        if home_id == "home-1" and self.issued_row is not None:
            return self.issued_row
        return None

    async def mark_claimed(
        self,
        *,
        pairing_id,
        claimed_at,
        claimed_by_member_id,
        claimed_by_terminal_id,
        bootstrap_token_ciphertext,
        bootstrap_token_expires_at,
        ctx=None,
    ):
        self.claimed_bootstrap_token_ciphertext = bootstrap_token_ciphertext

    async def mark_completed(self, *, pairing_id, completed_at, clear_bootstrap_token=True, ctx=None):
        self.completed_pairing_id = pairing_id

    async def insert_audit(self, input: NewTerminalPairingAuditRow, ctx=None):
        self.audits.append(input)
        return "audit-1"


def _service(repository: _Repository) -> TerminalPairingCodeService:
    return TerminalPairingCodeService(
        repository=repository,
        bootstrap_token_service=_BootstrapTokenService(),
        bootstrap_token_resolver=JwtBootstrapTokenResolver(
            secret="unit-test-bootstrap-secret",
            issuer="smart-home-backend",
            audience="smart-home-web-app",
            ttl_seconds=3600,
        ),
        connection_secret_cipher=FernetConnectionSecretCipher("unit-test-connection-secret"),
        clock=_Clock(),
        pairing_code_ttl_seconds=600,
    )


@pytest.mark.asyncio
async def test_issue_claim_and_poll_delivers_bootstrap_token():
    repository = _Repository()
    service = _service(repository)

    issued = await service.issue(TerminalPairingIssueInput(home_id="home-1", terminal_id="terminal-1"))
    claimed = await service.claim(
        TerminalPairingClaimInput(
            home_id="home-1",
            pairing_code=issued.pairing_code,
            claimed_by_member_id="member-1",
            claimed_by_terminal_id="terminal-2",
        )
    )
    polled = await service.poll(
        TerminalPairingPollInput(terminal_id="terminal-1", pairing_id=issued.pairing_id)
    )

    assert issued.status == "PENDING"
    assert claimed.status == "CLAIMED"
    assert polled.status == "DELIVERED"
    assert polled.bootstrap_token == "bootstrap-token-1"
    assert repository.completed_pairing_id == issued.pairing_id
    assert [audit.action_type for audit in repository.audits] == [
        "TERMINAL_PAIRING_CODE_ISSUED",
        "TERMINAL_PAIRING_CODE_CLAIMED",
    ]


@pytest.mark.asyncio
async def test_claim_rejects_malformed_pairing_code():
    service = _service(_Repository())

    with pytest.raises(AppError) as exc_info:
        await service.claim(
            TerminalPairingClaimInput(
                home_id="home-1",
                pairing_code="bad",
                claimed_by_member_id="member-1",
                claimed_by_terminal_id="terminal-2",
            )
        )

    assert exc_info.value.code == "INVALID_PARAMS"
