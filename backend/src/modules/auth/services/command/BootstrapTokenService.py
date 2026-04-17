from __future__ import annotations

from dataclasses import dataclass

from src.modules.auth.services.query.BootstrapTokenResolver import (
    BootstrapTokenError,
    BootstrapTokenResolver,
)
from src.repositories.base.auth.TerminalBootstrapTokenRepository import (
    NewTerminalBootstrapTokenRow,
    NewTerminalBootstrapTokenAuditRow,
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
class BootstrapTokenStatusInput:
    home_id: str
    target_terminal_id: str


@dataclass(frozen=True)
class BootstrapTokenStatusView:
    terminal_id: str
    terminal_mode: str
    token_configured: bool
    issued_at: str | None
    expires_at: str | None
    last_used_at: str | None


@dataclass(frozen=True)
class BootstrapTokenTerminalView:
    terminal_id: str
    terminal_code: str
    terminal_name: str
    terminal_mode: str
    token_configured: bool
    issued_at: str | None
    expires_at: str | None
    last_used_at: str | None


@dataclass(frozen=True)
class BootstrapTokenAuditView:
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

    async def get_status(
        self,
        input: BootstrapTokenStatusInput,
    ) -> BootstrapTokenStatusView:
        terminal = await self._repository.find_terminal(
            input.home_id,
            input.target_terminal_id,
        )
        if terminal is None:
            raise AppError(ErrorCode.NOT_FOUND, "terminal not found")
        token = await self._repository.find_active_for_terminal(
            home_id=input.home_id,
            terminal_id=terminal.id,
            now=self._clock.now().isoformat(),
        )
        return BootstrapTokenStatusView(
            terminal_id=terminal.id,
            terminal_mode=terminal.terminal_mode,
            token_configured=token is not None,
            issued_at=token.issued_at if token is not None else None,
            expires_at=token.expires_at if token is not None else None,
            last_used_at=token.last_used_at if token is not None else None,
        )

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
        action_type = (
            "TERMINAL_BOOTSTRAP_TOKEN_RESET"
            if rotated.revoked_count > 0
            else "TERMINAL_BOOTSTRAP_TOKEN_CREATE"
        )
        await self._repository.insert_audit(
            NewTerminalBootstrapTokenAuditRow(
                home_id=input.home_id,
                acting_terminal_id=input.created_by_terminal_id or terminal.id,
                operator_id=input.created_by_member_id,
                target_terminal_id=terminal.id,
                action_type=action_type,
                before_version=None if rotated.revoked_count == 0 else "active_token",
                after_version=claims.jti,
                result_status="SUCCESS",
                payload_json={
                    "expires_at": claims.expires_at.isoformat(),
                    "rotated": rotated.revoked_count > 0,
                    "scope": list(scope),
                    "target_terminal_mode": terminal.terminal_mode,
                },
                created_at=now.isoformat(),
            )
        )
        return BootstrapTokenCreateView(
            terminal_id=rotated.token.terminal_id,
            bootstrap_token=bootstrap_token,
            expires_at=rotated.token.expires_at,
            rotated=rotated.revoked_count > 0,
            scope=list(scope),
        )

    async def list_terminals(self, *, home_id: str) -> list[BootstrapTokenTerminalView]:
        rows = await self._repository.list_terminal_summaries(
            home_id=home_id,
            now=self._clock.now().isoformat(),
        )
        return [
            BootstrapTokenTerminalView(
                terminal_id=row.terminal_id,
                terminal_code=row.terminal_code,
                terminal_name=row.terminal_name,
                terminal_mode=row.terminal_mode,
                token_configured=row.token_configured,
                issued_at=row.issued_at,
                expires_at=row.expires_at,
                last_used_at=row.last_used_at,
            )
            for row in rows
        ]

    async def list_audits(
        self,
        *,
        home_id: str,
        limit: int = 20,
    ) -> list[BootstrapTokenAuditView]:
        bounded_limit = max(1, min(limit, 100))
        rows = await self._repository.list_audits(home_id=home_id, limit=bounded_limit)
        return [
            BootstrapTokenAuditView(
                audit_id=row.audit_id,
                terminal_id=row.terminal_id,
                terminal_code=row.terminal_code,
                terminal_name=row.terminal_name,
                action_type=row.action_type,
                operator_id=row.operator_id,
                operator_name=row.operator_name,
                acting_terminal_id=row.acting_terminal_id,
                acting_terminal_name=row.acting_terminal_name,
                before_version=row.before_version,
                after_version=row.after_version,
                result_status=row.result_status,
                expires_at=row.expires_at,
                rotated=row.rotated,
                created_at=row.created_at,
            )
            for row in rows
        ]

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
