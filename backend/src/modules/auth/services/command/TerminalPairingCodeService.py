from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from math import ceil
from secrets import choice
from string import ascii_uppercase, digits

from src.infrastructure.security.impl.FernetConnectionSecretCipher import (
    FernetConnectionSecretCipher,
)
from src.modules.auth.services.command.BootstrapTokenService import (
    BootstrapTokenCreateInput,
    BootstrapTokenService,
)
from src.modules.auth.services.query.BootstrapTokenResolver import BootstrapTokenResolver
from src.repositories.base.auth.TerminalPairingCodeRepository import (
    NewTerminalPairingAuditRow,
    NewTerminalPairingSessionRow,
    TerminalPairingCodeRepository,
)
from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode
from src.shared.kernel.Clock import Clock
from src.shared.observability import get_observability_metrics

PAIRING_CODE_GROUP = 4
PAIRING_CODE_GROUPS = 2
PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


@dataclass(frozen=True)
class TerminalPairingIssueInput:
    home_id: str
    terminal_id: str


@dataclass(frozen=True)
class TerminalPairingIssueView:
    pairing_id: str
    terminal_id: str
    terminal_code: str
    terminal_name: str
    terminal_mode: str
    pairing_code: str
    expires_at: str
    status: str


@dataclass(frozen=True)
class TerminalPairingPollInput:
    terminal_id: str
    pairing_id: str


@dataclass(frozen=True)
class TerminalPairingPollView:
    pairing_id: str
    terminal_id: str
    terminal_code: str
    terminal_name: str
    terminal_mode: str
    status: str
    expires_at: str
    claimed_at: str | None
    bootstrap_token: str | None
    bootstrap_token_expires_at: str | None


@dataclass(frozen=True)
class TerminalPairingClaimInput:
    home_id: str
    pairing_code: str
    claimed_by_member_id: str | None
    claimed_by_terminal_id: str


@dataclass(frozen=True)
class TerminalPairingClaimView:
    pairing_id: str
    terminal_id: str
    terminal_code: str
    terminal_name: str
    terminal_mode: str
    status: str
    claimed_at: str
    bootstrap_token_expires_at: str
    rotated: bool


class TerminalPairingCodeService:
    def __init__(
        self,
        *,
        repository: TerminalPairingCodeRepository,
        bootstrap_token_service: BootstrapTokenService,
        bootstrap_token_resolver: BootstrapTokenResolver,
        connection_secret_cipher: FernetConnectionSecretCipher,
        clock: Clock,
        pairing_code_ttl_seconds: int,
        pairing_code_issue_cooldown_seconds: int = 30,
    ) -> None:
        self._repository = repository
        self._bootstrap_token_service = bootstrap_token_service
        self._bootstrap_token_resolver = bootstrap_token_resolver
        self._connection_secret_cipher = connection_secret_cipher
        self._clock = clock
        self._pairing_code_ttl_seconds = max(60, pairing_code_ttl_seconds)
        self._pairing_code_issue_cooldown_seconds = max(
            0,
            pairing_code_issue_cooldown_seconds,
        )

    async def issue(self, input: TerminalPairingIssueInput) -> TerminalPairingIssueView:
        terminal = await self._repository.find_terminal(input.home_id, input.terminal_id)
        if terminal is None:
            _record_pairing_event("issue_not_found")
            raise AppError(ErrorCode.NOT_FOUND, "terminal not found")

        now = self._clock.now()
        active = await self._repository.find_active_for_terminal(
            terminal_id=terminal.id,
            now=now.isoformat(),
        )
        if active is not None:
            elapsed_seconds = (now - _parse_datetime(active.issued_at)).total_seconds()
            if elapsed_seconds < self._pairing_code_issue_cooldown_seconds:
                retry_after_seconds = max(
                    1,
                    ceil(self._pairing_code_issue_cooldown_seconds - elapsed_seconds),
                )
                _record_pairing_event("issue_cooldown")
                raise AppError(
                    ErrorCode.INVALID_PARAMS,
                    "pairing code was issued recently",
                    details={
                        "reason": "cooldown",
                        "retry_after_seconds": retry_after_seconds,
                        "pairing_id": active.pairing_id,
                        "expires_at": active.expires_at,
                    },
                )

        pairing_code = _format_pairing_code(_random_pairing_code())
        row = await self._repository.issue_for_terminal(
            NewTerminalPairingSessionRow(
                terminal_id=terminal.id,
                pairing_code_hash=self._bootstrap_token_resolver.hash_token(
                    _normalize_pairing_code(pairing_code)
                ),
                issued_at=now.isoformat(),
                expires_at=(now + timedelta(seconds=self._pairing_code_ttl_seconds)).isoformat(),
            ),
            invalidated_at=now.isoformat(),
        )
        await self._repository.insert_audit(
            NewTerminalPairingAuditRow(
                home_id=input.home_id,
                acting_terminal_id=terminal.id,
                operator_id=None,
                target_terminal_id=terminal.id,
                action_type="TERMINAL_PAIRING_CODE_ISSUED",
                after_version=row.pairing_id,
                result_status="SUCCESS",
                payload_json={
                    "expires_at": row.expires_at,
                    "terminal_mode": terminal.terminal_mode,
                },
                created_at=now.isoformat(),
            )
        )
        _record_pairing_event("issue_success")
        return TerminalPairingIssueView(
            pairing_id=row.pairing_id,
            terminal_id=row.terminal_id,
            terminal_code=row.terminal_code,
            terminal_name=row.terminal_name,
            terminal_mode=row.terminal_mode,
            pairing_code=pairing_code,
            expires_at=row.expires_at,
            status="PENDING",
        )

    async def poll(self, input: TerminalPairingPollInput) -> TerminalPairingPollView:
        row = await self._repository.find_session_for_terminal(
            terminal_id=input.terminal_id,
            pairing_id=input.pairing_id,
        )
        if row is None:
            _record_pairing_event("poll_not_found")
            raise AppError(ErrorCode.NOT_FOUND, "pairing session not found")

        now_iso = self._clock.now().isoformat()
        status = _pairing_status(row, now_iso)
        bootstrap_token = None
        if status == "CLAIMED" and row.bootstrap_token_ciphertext:
            bootstrap_token = self._connection_secret_cipher.decrypt(row.bootstrap_token_ciphertext)
            await self._repository.mark_completed(
                pairing_id=row.pairing_id,
                completed_at=now_iso,
                clear_bootstrap_token=True,
            )
            status = "DELIVERED"

        _record_pairing_event(f"poll_{status.lower()}")
        return TerminalPairingPollView(
            pairing_id=row.pairing_id,
            terminal_id=row.terminal_id,
            terminal_code=row.terminal_code,
            terminal_name=row.terminal_name,
            terminal_mode=row.terminal_mode,
            status=status,
            expires_at=row.expires_at,
            claimed_at=row.claimed_at,
            bootstrap_token=bootstrap_token,
            bootstrap_token_expires_at=row.bootstrap_token_expires_at,
        )

    async def claim(self, input: TerminalPairingClaimInput) -> TerminalPairingClaimView:
        normalized_code = _normalize_pairing_code(input.pairing_code)
        expected_length = PAIRING_CODE_GROUP * PAIRING_CODE_GROUPS
        if len(normalized_code) != expected_length:
            now_iso = self._clock.now().isoformat()
            await self._record_failed_claim(
                input,
                reason="malformed",
                created_at=now_iso,
                payload={"normalized_length": len(normalized_code)},
            )
            _record_pairing_event("claim_failed_malformed")
            raise AppError(
                ErrorCode.INVALID_PARAMS,
                "pairing code format is invalid",
                details={"reason": "malformed"},
            )

        now = self._clock.now()
        row = await self._repository.find_active_by_code_hash(
            home_id=input.home_id,
            pairing_code_hash=self._bootstrap_token_resolver.hash_token(normalized_code),
            now=now.isoformat(),
        )
        if row is None:
            await self._record_failed_claim(
                input,
                reason="expired_or_invalid",
                created_at=now.isoformat(),
                payload={},
            )
            _record_pairing_event("claim_failed_expired_or_invalid")
            raise AppError(
                ErrorCode.NOT_FOUND,
                "pairing code not found or expired",
                details={"reason": "expired_or_invalid"},
            )

        issued = await self._bootstrap_token_service.create_or_reset(
            BootstrapTokenCreateInput(
                home_id=input.home_id,
                target_terminal_id=row.terminal_id,
                created_by_member_id=input.claimed_by_member_id,
                created_by_terminal_id=input.claimed_by_terminal_id,
            )
        )
        await self._repository.mark_claimed(
            pairing_id=row.pairing_id,
            claimed_at=now.isoformat(),
            claimed_by_member_id=input.claimed_by_member_id,
            claimed_by_terminal_id=input.claimed_by_terminal_id,
            bootstrap_token_ciphertext=self._connection_secret_cipher.encrypt(
                issued.bootstrap_token
            ),
            bootstrap_token_expires_at=issued.expires_at,
        )
        await self._repository.insert_audit(
            NewTerminalPairingAuditRow(
                home_id=input.home_id,
                acting_terminal_id=input.claimed_by_terminal_id,
                operator_id=input.claimed_by_member_id,
                target_terminal_id=row.terminal_id,
                action_type="TERMINAL_PAIRING_CODE_CLAIMED",
                after_version=row.pairing_id,
                result_status="SUCCESS",
                payload_json={
                    "claimed_at": now.isoformat(),
                    "bootstrap_token_expires_at": issued.expires_at,
                    "rotated": issued.rotated,
                },
                created_at=now.isoformat(),
            )
        )
        _record_pairing_event("claim_success")
        return TerminalPairingClaimView(
            pairing_id=row.pairing_id,
            terminal_id=row.terminal_id,
            terminal_code=row.terminal_code,
            terminal_name=row.terminal_name,
            terminal_mode=row.terminal_mode,
            status="CLAIMED",
            claimed_at=now.isoformat(),
            bootstrap_token_expires_at=issued.expires_at,
            rotated=issued.rotated,
        )

    async def _record_failed_claim(
        self,
        input: TerminalPairingClaimInput,
        *,
        reason: str,
        created_at: str,
        payload: dict[str, object | str | bool | int | float | None],
    ) -> None:
        await self._repository.insert_audit(
            NewTerminalPairingAuditRow(
                home_id=input.home_id,
                acting_terminal_id=input.claimed_by_terminal_id,
                operator_id=input.claimed_by_member_id,
                target_terminal_id=input.claimed_by_terminal_id,
                action_type="TERMINAL_PAIRING_CODE_CLAIM_FAILED",
                after_version=None,
                result_status="FAILURE",
                payload_json={
                    "reason": reason,
                    **payload,
                },
                created_at=created_at,
            )
        )


def _normalize_pairing_code(value: str) -> str:
    return "".join(char for char in value.upper() if char in ascii_uppercase + digits)


def _random_pairing_code() -> str:
    return "".join(
        choice(PAIRING_ALPHABET) for _ in range(PAIRING_CODE_GROUP * PAIRING_CODE_GROUPS)
    )


def _format_pairing_code(value: str) -> str:
    normalized = _normalize_pairing_code(value)
    groups = [
        normalized[index : index + PAIRING_CODE_GROUP]
        for index in range(0, len(normalized), PAIRING_CODE_GROUP)
    ]
    return "-".join(groups)


def _pairing_status(row, now_iso: str) -> str:
    if row.invalidated_at is not None:
        return "INVALIDATED"
    if row.completed_at is not None:
        return "COMPLETED"
    if _parse_datetime(row.expires_at) <= _parse_datetime(now_iso):
        return "EXPIRED"
    if row.claimed_at is not None:
        return "CLAIMED"
    return "PENDING"


def _parse_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _record_pairing_event(result: str) -> None:
    get_observability_metrics().record_terminal_pairing_event(result)
