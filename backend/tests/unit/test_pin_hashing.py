from __future__ import annotations

from datetime import datetime, timezone

import pytest

from src.modules.auth.services.PinHashing import (
    PIN_HASH_ALGORITHM,
    hash_pin,
    legacy_sha256_pin_hash,
    needs_pin_hash_upgrade,
    verify_pin,
)
from src.modules.auth.services.command.PinVerificationService import (
    PinVerificationInput,
    PinVerificationService,
)
from src.repositories.base.auth.PinLockRepository import PinFailureUpsert
from src.repositories.base.auth.PinSessionRepository import NewPinSessionRow
from src.repositories.rows.index import HomeAuthConfigRow, PinLockRow, PinSessionRow
from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode


class _Clock:
    def now(self) -> datetime:
        return datetime(2026, 4, 29, 10, 0, tzinfo=timezone.utc)


class _IdGenerator:
    def next_id(self) -> str:
        return "pin-session-token"


class _HomeAuthConfigRepository:
    def __init__(self, row: HomeAuthConfigRow | None) -> None:
        self.row = row
        self.updated_pin_hash: str | None = None
        self.updated_pin_salt: str | None = None

    async def find_by_home_id(self, _home_id: str, ctx=None):
        return self.row

    async def update_pin_hash(self, _home_id: str, *, pin_hash: str, pin_salt: str | None, ctx=None):
        self.updated_pin_hash = pin_hash
        self.updated_pin_salt = pin_salt


class _PinLockRepository:
    def __init__(self) -> None:
        self.failure: PinFailureUpsert | None = None
        self.cleared = False

    async def find_by_home_and_terminal(self, _home_id: str, _terminal_id: str, ctx=None):
        return None

    async def upsert_failure(self, input: PinFailureUpsert, ctx=None):
        self.failure = input
        return PinLockRow(
            id="lock-1",
            home_id=input.home_id,
            terminal_id=input.terminal_id,
            failed_attempts=input.failed_attempts,
            locked_until=input.locked_until,
            last_failed_at=input.last_failed_at,
        )

    async def clear_failures(self, _home_id: str, _terminal_id: str, ctx=None):
        self.cleared = True


class _PinSessionRepository:
    def __init__(self) -> None:
        self.inserted: NewPinSessionRow | None = None

    async def find_active_by_home_and_terminal(self, _home_id: str, _terminal_id: str, ctx=None):
        return None

    async def insert(self, input: NewPinSessionRow, ctx=None):
        self.inserted = input
        return PinSessionRow(
            id="session-1",
            home_id=input.home_id,
            terminal_id=input.terminal_id,
            member_id=input.member_id,
            verified_for_action=input.verified_for_action,
            is_active=True,
            verified_at=input.verified_at,
            expires_at=input.expires_at,
        )

    async def deactivate_active_by_home_and_terminal(self, _home_id: str, _terminal_id: str, ctx=None):
        return 1

    async def mark_expired_before(self, _now: str, ctx=None):
        return 0


def _auth_row(*, pin_hash: str, pin_salt: str | None = None) -> HomeAuthConfigRow:
    return HomeAuthConfigRow(
        id="auth-1",
        home_id="home-1",
        login_mode="FIXED_HOME_ACCOUNT",
        pin_retry_limit=5,
        pin_lock_minutes=5,
        pin_session_ttl_seconds=600,
        pin_hash=pin_hash,
        pin_salt=pin_salt,
    )


def _service(auth_repository: _HomeAuthConfigRepository, lock_repository: _PinLockRepository):
    session_repository = _PinSessionRepository()
    return (
        PinVerificationService(
            home_auth_config_repository=auth_repository,
            pin_session_repository=session_repository,
            pin_lock_repository=lock_repository,
            id_generator=_IdGenerator(),
            clock=_Clock(),
        ),
        session_repository,
    )


def test_argon2id_pin_hash_verifies_and_marks_legacy_hashes_for_upgrade():
    stored_hash = hash_pin("1234")

    assert stored_hash.startswith(f"${PIN_HASH_ALGORITHM}$")
    assert verify_pin("1234", stored_hash, None) is True
    assert verify_pin("0000", stored_hash, None) is False
    assert needs_pin_hash_upgrade(stored_hash) is False
    assert needs_pin_hash_upgrade(legacy_sha256_pin_hash("1234", "dev-salt")) is True


@pytest.mark.asyncio
async def test_pin_verify_upgrades_legacy_sha256_hash_after_success():
    legacy_hash = legacy_sha256_pin_hash("1234", "dev-salt")
    auth_repository = _HomeAuthConfigRepository(_auth_row(pin_hash=legacy_hash, pin_salt="dev-salt"))
    lock_repository = _PinLockRepository()
    service, session_repository = _service(auth_repository, lock_repository)

    view = await service.verify(
        PinVerificationInput(
            home_id="home-1",
            terminal_id="terminal-1",
            pin="1234",
            target_action="settings",
        )
    )

    assert view.verified is True
    assert session_repository.inserted is not None
    assert auth_repository.updated_pin_hash is not None
    assert auth_repository.updated_pin_hash.startswith(f"${PIN_HASH_ALGORITHM}$")
    assert auth_repository.updated_pin_salt is None
    assert lock_repository.cleared is True


@pytest.mark.asyncio
async def test_pin_verify_keeps_current_hash_and_does_not_rehash_every_success():
    stored_hash = hash_pin("1234")
    auth_repository = _HomeAuthConfigRepository(_auth_row(pin_hash=stored_hash))
    lock_repository = _PinLockRepository()
    service, _session_repository = _service(auth_repository, lock_repository)

    await service.verify(
        PinVerificationInput(
            home_id="home-1",
            terminal_id="terminal-1",
            pin="1234",
            target_action="settings",
        )
    )

    assert auth_repository.updated_pin_hash is None


@pytest.mark.asyncio
async def test_pin_verify_does_not_upgrade_when_pin_is_invalid():
    legacy_hash = legacy_sha256_pin_hash("1234", "dev-salt")
    auth_repository = _HomeAuthConfigRepository(_auth_row(pin_hash=legacy_hash, pin_salt="dev-salt"))
    lock_repository = _PinLockRepository()
    service, _session_repository = _service(auth_repository, lock_repository)

    with pytest.raises(AppError) as exc_info:
        await service.verify(
            PinVerificationInput(
                home_id="home-1",
                terminal_id="terminal-1",
                pin="0000",
                target_action="settings",
            )
        )

    assert exc_info.value.code == ErrorCode.PIN_REQUIRED
    assert auth_repository.updated_pin_hash is None
    assert lock_repository.failure is not None
