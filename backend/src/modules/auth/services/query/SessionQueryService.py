from __future__ import annotations

from datetime import datetime
from dataclasses import dataclass

from src.infrastructure.capabilities.CapabilityProvider import CapabilityProvider
from src.repositories.query.auth.AuthSessionQueryRepository import (
    AuthSessionQueryRepository,
)
from src.shared.kernel.Clock import Clock


@dataclass(frozen=True)
class SessionQueryInput:
    home_id: str
    terminal_id: str


@dataclass(frozen=True)
class AuthSessionFeaturesView:
    music_enabled: bool
    energy_enabled: bool
    editor_enabled: bool


@dataclass(frozen=True)
class AuthSessionView:
    home_id: str
    terminal_id: str
    terminal_mode: str
    login_mode: str
    pin_session_active: bool
    features: AuthSessionFeaturesView


class SessionQueryService:
    def __init__(
        self,
        auth_session_query_repository: AuthSessionQueryRepository,
        capability_provider: CapabilityProvider,
        clock: Clock,
    ) -> None:
        self._auth_session_query_repository = auth_session_query_repository
        self._capability_provider = capability_provider
        self._clock = clock

    async def get_session(self, input: SessionQueryInput) -> AuthSessionView:
        now = self._clock.now()
        session_context, capabilities = await self._auth_session_query_repository.get_auth_session_context(
            input.home_id,
            input.terminal_id,
            now,
        ), await self._capability_provider.get_capabilities(input.home_id)

        active_pin_session = session_context.active_pin_session
        pin_session_active = False
        if active_pin_session is not None:
            expires_at = datetime.fromisoformat(active_pin_session.expires_at)
            pin_session_active = active_pin_session.is_active and expires_at > now

        return AuthSessionView(
            home_id=session_context.home.id,
            terminal_id=session_context.terminal.id,
            terminal_mode=session_context.terminal.terminal_mode,
            login_mode=session_context.auth_config.login_mode,
            pin_session_active=pin_session_active,
            features=AuthSessionFeaturesView(
                music_enabled=session_context.function_settings.music_enabled
                if session_context.function_settings is not None
                else False,
                energy_enabled=capabilities.energy_enabled,
                editor_enabled=capabilities.editor_enabled,
            ),
        )
