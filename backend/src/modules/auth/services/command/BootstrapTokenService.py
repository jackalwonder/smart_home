from __future__ import annotations

from dataclasses import dataclass

from src.modules.auth.services.query.BootstrapTokenResolver import (
    BootstrapTokenError,
    BootstrapTokenResolver,
)
from src.repositories.base.auth.TerminalBootstrapTokenRepository import (
    NewTerminalBootstrapTokenRow,
    TerminalBootstrapTokenRepository,
)
from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode
from src.shared.kernel.Clock import Clock


@dataclass(frozen=True)
class BootstrapTokenCreateInput:
    home_id: str
    target_terminal_id: str
    created_by_member_id: str | None
    created_by_terminal_id: str | None


@dataclass(frozen=True)
class BootstrapTokenCreateView:
    terminal_id: str
    bootstrap_token: str
    expires_at: str
    rotated: bool
    scope: list[str]


@dataclass(frozen=True)
class BootstrapSessionContext:
    home_id: str
    terminal_id: str
    terminal_mode: str
    bootstrap_token_jti: str


class BootstrapTokenService:
    def __init__(
        self,
        *,
        repository: TerminalBootstrapTokenRepository,
        resolver: BootstrapTokenResolver,
        clock: Clock,
    ) -> None:
        self._repository = repository
        self._resolver = resolver
        self._clock = clock

    async def create_or_reset(
        self,
        input: BootstrapTokenCreateInput,
    ) -> BootstrapTokenCreateView:
        terminal = await self._repository.find_terminal(
            input.home_id,
            input.target_terminal_id,
        )
        if terminal is None:
            raise AppError(ErrorCode.NOT_FOUND, "terminal not found")
        scope = ("bootstrap:session",)
        now = self._clock.now()
        bootstrap_token = self._resolver.issue(
            home_id=input.home_id,
            terminal_id=terminal.id,
            terminal_mode=terminal.terminal_mode,
            scope=scope,
            subject=terminal.id,
            now=now,
        )
        claims = self._resolve_token(bootstrap_token)
        rotated = await self._repository.rotate_for_terminal(
            NewTerminalBootstrapTokenRow(
                terminal_id=terminal.id,
                token_hash=self._resolver.hash_token(bootstrap_token),
                token_jti=claims.jti,
                issued_at=now.isoformat(),
                expires_at=claims.expires_at.isoformat(),
                created_by_member_id=input.created_by_member_id,
                created_by_terminal_id=input.created_by_terminal_id,
            ),
            revoked_at=now.isoformat(),
        )
        return BootstrapTokenCreateView(
            terminal_id=rotated.token.terminal_id,
            bootstrap_token=bootstrap_token,
            expires_at=rotated.token.expires_at,
            rotated=rotated.revoked_count > 0,
            scope=list(scope),
        )

    async def exchange(self, token: str) -> BootstrapSessionContext:
        claims = self._resolve_token(token)
        now = self._clock.now()
        stored_token = await self._repository.find_usable(
            token_jti=claims.jti,
            token_hash=self._resolver.hash_token(token),
            home_id=claims.home_id,
            terminal_id=claims.terminal_id,
            now=now.isoformat(),
        )
        if stored_token is None:
            raise AppError(ErrorCode.UNAUTHORIZED, "bootstrap token is invalid")
        await self._repository.mark_used(stored_token.id, now.isoformat())
        return BootstrapSessionContext(
            home_id=stored_token.home_id,
            terminal_id=stored_token.terminal_id,
            terminal_mode=stored_token.terminal_mode,
            bootstrap_token_jti=stored_token.token_jti,
        )

    def _resolve_token(self, token: str):
        try:
            claims = self._resolver.resolve(token, required_scope="bootstrap:session")
        except BootstrapTokenError as exc:
            raise AppError(ErrorCode.UNAUTHORIZED, "bootstrap token is invalid") from exc
        if claims is None:
            raise AppError(ErrorCode.UNAUTHORIZED, "bootstrap token is invalid")
        return claims
