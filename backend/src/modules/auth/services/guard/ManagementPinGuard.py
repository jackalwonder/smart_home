from __future__ import annotations

from datetime import datetime

from src.repositories.base.auth.PinSessionRepository import PinSessionRepository
from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode
from src.shared.kernel.Clock import Clock


class ManagementPinGuard:
    def __init__(self, pin_session_repository: PinSessionRepository, clock: Clock) -> None:
        self._pin_session_repository = pin_session_repository
        self._clock = clock

    async def require_active_session(self, home_id: str, terminal_id: str) -> None:
        session = await self._pin_session_repository.find_active_by_home_and_terminal(
            home_id,
            terminal_id,
        )
        if session is None or not session.is_active:
            raise AppError(ErrorCode.PIN_REQUIRED, "active PIN session is required")
        expires_at = datetime.fromisoformat(session.expires_at)
        if expires_at <= self._clock.now():
            raise AppError(ErrorCode.PIN_REQUIRED, "PIN session is expired")
