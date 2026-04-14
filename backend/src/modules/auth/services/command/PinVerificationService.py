from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime, timedelta

from src.repositories.base.auth.HomeAuthConfigRepository import HomeAuthConfigRepository
from src.repositories.base.auth.PinLockRepository import PinFailureUpsert, PinLockRepository
from src.repositories.base.auth.PinSessionRepository import NewPinSessionRow, PinSessionRepository
from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode
from src.shared.kernel.Clock import Clock
from src.shared.kernel.IdGenerator import IdGenerator


def _hash_pin(pin: str, salt: str | None) -> str:
    return hashlib.sha256(f"{pin}:{salt or ''}".encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class PinVerificationInput:
    home_id: str
    terminal_id: str
    pin: str
    target_action: str | None
    member_id: str | None = None


@dataclass(frozen=True)
class PinVerificationView:
    verified: bool
    pin_session_active: bool
    pin_session_expires_at: str
    remaining_attempts: int
    lock_until: str | None
    session_token: str | None = None


@dataclass(frozen=True)
class PinSessionStatusView:
    pin_session_active: bool
    pin_session_expires_at: str | None = None
    remaining_lock_seconds: int = 0


class PinVerificationService:
    def __init__(
        self,
        home_auth_config_repository: HomeAuthConfigRepository,
        pin_session_repository: PinSessionRepository,
        pin_lock_repository: PinLockRepository,
        id_generator: IdGenerator,
        clock: Clock,
    ) -> None:
        self._home_auth_config_repository = home_auth_config_repository
        self._pin_session_repository = pin_session_repository
        self._pin_lock_repository = pin_lock_repository
        self._id_generator = id_generator
        self._clock = clock

    async def verify(self, input: PinVerificationInput) -> PinVerificationView:
        now = self._clock.now()
        auth = await self._home_auth_config_repository.find_by_home_id(input.home_id)
        if auth is None:
            raise AppError(ErrorCode.PIN_REQUIRED, "PIN is not configured")
        lock = await self._pin_lock_repository.find_by_home_and_terminal(input.home_id, input.terminal_id)
        if (
            lock is not None
            and lock.locked_until is not None
            and datetime.fromisoformat(lock.locked_until) > now
        ):
            raise AppError(ErrorCode.PIN_LOCKED, "PIN is temporarily locked")

        expected_hash = auth.pin_hash
        is_valid = expected_hash is not None and _hash_pin(input.pin, auth.pin_salt) == expected_hash
        if not is_valid:
            attempts = (lock.failed_attempts if lock is not None else 0) + 1
            locked_until = None
            if attempts >= auth.pin_retry_limit:
                locked_until = (now + timedelta(minutes=auth.pin_lock_minutes)).isoformat()
            await self._pin_lock_repository.upsert_failure(
                PinFailureUpsert(
                    home_id=input.home_id,
                    terminal_id=input.terminal_id,
                    failed_attempts=attempts,
                    locked_until=locked_until,
                    last_failed_at=now.isoformat(),
                )
            )
            raise AppError(ErrorCode.PIN_REQUIRED, "invalid PIN")

        await self._pin_lock_repository.clear_failures(input.home_id, input.terminal_id)
        await self._pin_session_repository.deactivate_active_by_home_and_terminal(
            input.home_id,
            input.terminal_id,
        )
        expires_at = (now + timedelta(seconds=auth.pin_session_ttl_seconds)).isoformat()
        session_token = self._id_generator.next_id()
        await self._pin_session_repository.insert(
            NewPinSessionRow(
                home_id=input.home_id,
                terminal_id=input.terminal_id,
                member_id=input.member_id,
                verified_for_action=input.target_action,
                session_token_hash=session_token,
                verified_at=now.isoformat(),
                expires_at=expires_at,
            )
        )
        return PinVerificationView(
            verified=True,
            pin_session_active=True,
            pin_session_expires_at=expires_at,
            remaining_attempts=auth.pin_retry_limit,
            lock_until=None,
            session_token=session_token,
        )

    async def get_session_status(self, home_id: str, terminal_id: str) -> PinSessionStatusView:
        now = self._clock.now().isoformat()
        await self._pin_session_repository.mark_expired_before(now)
        session = await self._pin_session_repository.find_active_by_home_and_terminal(
            home_id,
            terminal_id,
        )
        lock = await self._pin_lock_repository.find_by_home_and_terminal(home_id, terminal_id)
        if session is None:
            remaining_lock_seconds = 0
            if lock is not None and lock.locked_until is not None:
                delta = datetime.fromisoformat(lock.locked_until) - self._clock.now()
                remaining_lock_seconds = max(int(delta.total_seconds()), 0)
            return PinSessionStatusView(
                pin_session_active=False,
                pin_session_expires_at=None,
                remaining_lock_seconds=remaining_lock_seconds,
            )
        if datetime.fromisoformat(session.expires_at) <= self._clock.now():
            await self._pin_session_repository.deactivate_active_by_home_and_terminal(
                home_id,
                terminal_id,
            )
            return PinSessionStatusView(pin_session_active=False, pin_session_expires_at=None)
        return PinSessionStatusView(
            pin_session_active=True,
            pin_session_expires_at=session.expires_at,
            remaining_lock_seconds=0,
        )
