from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Mapping

from fastapi import Request, WebSocket

from src.modules.auth.services.query.AccessTokenResolver import (
    AccessTokenClaims,
    AccessTokenError,
    AccessTokenResolver,
    NoopAccessTokenResolver,
)
from src.repositories.query.auth.RequestContextRepository import (
    RequestContextLookupRow,
    RequestContextRepository,
)
from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode


@dataclass(frozen=True)
class RequestContext:
    home_id: str | None
    terminal_id: str | None
    operator_id: str | None = None
    session_token: str | None = None
    auth_mode: str = "legacy_context"
    access_token_jti: str | None = None
    access_token_expires_at: datetime | None = None


@dataclass(frozen=True)
class _AccessTokenCandidate:
    token: str
    strict: bool


def _normalize(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _header(headers: Mapping[str, str], name: str) -> str | None:
    return _normalize(headers.get(name))


def _cookie(cookies: Mapping[str, str], name: str) -> str | None:
    return _normalize(cookies.get(name))


def _query(params: Mapping[str, str], name: str) -> str | None:
    return _normalize(params.get(name))


def _websocket_protocol_bearer(headers: Mapping[str, str]) -> str | None:
    protocol = _header(headers, "sec-websocket-protocol")
    if protocol is None:
        return None
    parts = [_normalize(part) for part in protocol.split(",")]
    normalized_parts = [part for part in parts if part is not None]
    for index, part in enumerate(normalized_parts):
        if part.lower() == "bearer" and index + 1 < len(normalized_parts):
            return normalized_parts[index + 1]
    return None


class RequestContextService:
    def __init__(
        self,
        request_context_repository: RequestContextRepository,
        access_token_resolver: AccessTokenResolver | None = None,
    ) -> None:
        self._request_context_repository = request_context_repository
        self._access_token_resolver = access_token_resolver or NoopAccessTokenResolver()

    def _context_from_row(
        self,
        row: RequestContextLookupRow,
        *,
        session_token: str | None = None,
    ) -> RequestContext:
        return RequestContext(
            home_id=row.home_id,
            terminal_id=row.terminal_id,
            operator_id=row.operator_id,
            session_token=session_token,
        )

    def _resolve_access_token_candidate(
        self,
        *,
        query_params: Mapping[str, str],
        headers: Mapping[str, str],
        cookies: Mapping[str, str],
        explicit_token: str | None = None,
        allow_query_access_token: bool = True,
        allow_cookie_access_token: bool = True,
        allow_explicit_token: bool = True,
    ) -> _AccessTokenCandidate | None:
        authorization = _header(headers, "authorization")
        if authorization is not None and authorization.lower().startswith("bearer "):
            token = _normalize(authorization[7:])
            return _AccessTokenCandidate(token=token, strict=True) if token is not None else None
        protocol_token = _websocket_protocol_bearer(headers)
        if protocol_token is not None:
            return _AccessTokenCandidate(token=protocol_token, strict=True)
        if allow_query_access_token:
            query_access_token = _query(query_params, "access_token")
            if query_access_token is not None:
                return _AccessTokenCandidate(token=query_access_token, strict=True)
        if allow_cookie_access_token:
            cookie_access_token = _cookie(cookies, "access_token")
            if cookie_access_token is not None:
                return _AccessTokenCandidate(token=cookie_access_token, strict=True)
        if allow_explicit_token:
            token = _normalize(explicit_token)
            if token is not None:
                return _AccessTokenCandidate(token=token, strict=False)
        return None

    def _resolve_legacy_session_token(
        self,
        *,
        query_params: Mapping[str, str],
        headers: Mapping[str, str],
        cookies: Mapping[str, str],
        explicit_token: str | None = None,
    ) -> str | None:
        return (
            _normalize(explicit_token)
            or _query(query_params, "token")
            or _query(query_params, "session_token")
            or _cookie(cookies, "pin_session_token")
            or _cookie(cookies, "session_token")
        )

    def _resolve_bearer_claims(
        self,
        *,
        query_params: Mapping[str, str],
        headers: Mapping[str, str],
        cookies: Mapping[str, str],
        explicit_token: str | None = None,
        required_scope: str | None = None,
        allow_query_access_token: bool = True,
        allow_cookie_access_token: bool = True,
        allow_explicit_token: bool = True,
    ) -> AccessTokenClaims | None:
        candidate = self._resolve_access_token_candidate(
            query_params=query_params,
            headers=headers,
            cookies=cookies,
            explicit_token=explicit_token,
            allow_query_access_token=allow_query_access_token,
            allow_cookie_access_token=allow_cookie_access_token,
            allow_explicit_token=allow_explicit_token,
        )
        if candidate is None:
            return None
        try:
            claims = self._access_token_resolver.resolve(
                candidate.token,
                required_scope=required_scope,
            )
        except AccessTokenError as exc:
            raise AppError(
                ErrorCode.UNAUTHORIZED,
                "invalid access token",
                details={"reason": exc.reason},
            ) from exc
        if claims is None:
            if candidate.strict:
                raise AppError(ErrorCode.UNAUTHORIZED, "invalid access token")
            return None
        if claims.raw_token is None:
            return AccessTokenClaims(
                home_id=claims.home_id,
                terminal_id=claims.terminal_id,
                operator_id=claims.operator_id,
                raw_token=candidate.token,
                role=claims.role,
                scope=claims.scope,
                jti=claims.jti,
                expires_at=claims.expires_at,
            )
        return claims

    def _resolve_terminal_id(
        self,
        *,
        query_params: Mapping[str, str],
        headers: Mapping[str, str],
        cookies: Mapping[str, str],
        explicit_terminal_id: str | None = None,
    ) -> str | None:
        return (
            _normalize(explicit_terminal_id)
            or _query(query_params, "terminal_id")
            or _header(headers, "x-terminal-id")
            or _cookie(cookies, "terminal_id")
        )

    def _resolve_home_id(
        self,
        *,
        query_params: Mapping[str, str],
        headers: Mapping[str, str],
        cookies: Mapping[str, str],
        explicit_home_id: str | None = None,
        fallback_home_id: str | None = None,
    ) -> str | None:
        return (
            _normalize(explicit_home_id)
            or _query(query_params, "home_id")
            or _header(headers, "x-home-id")
            or _cookie(cookies, "home_id")
            or _normalize(fallback_home_id)
        )

    async def _find_terminal_context(self, terminal_id: str) -> RequestContext | None:
        row = await self._request_context_repository.find_terminal_context(terminal_id)
        return self._context_from_row(row) if row is not None else None

    async def _find_session_context(self, session_token: str) -> RequestContext | None:
        row = await self._request_context_repository.find_session_context(session_token)
        return (
            self._context_from_row(row, session_token=session_token)
            if row is not None
            else None
        )

    async def find_home_id_by_device_id(self, device_id: str) -> str | None:
        return await self._request_context_repository.find_home_id_by_device_id(
            device_id,
        )

    async def find_home_id_by_control_request_id(self, request_id: str) -> str | None:
        return await self._request_context_repository.find_home_id_by_control_request_id(
            request_id,
        )

    async def _resolve_context(
        self,
        *,
        query_params: Mapping[str, str],
        headers: Mapping[str, str],
        cookies: Mapping[str, str],
        explicit_home_id: str | None = None,
        explicit_terminal_id: str | None = None,
        explicit_token: str | None = None,
        fallback_home_id: str | None = None,
        require_home: bool = False,
        require_terminal: bool = False,
        require_bearer: bool = False,
        require_session_auth: bool = False,
        required_access_scope: str | None = None,
        allow_query_access_token: bool = True,
        allow_cookie_access_token: bool = True,
        allow_explicit_token: bool = True,
    ) -> RequestContext:
        bearer_claims = self._resolve_bearer_claims(
            query_params=query_params,
            headers=headers,
            cookies=cookies,
            explicit_token=explicit_token,
            required_scope=required_access_scope,
            allow_query_access_token=allow_query_access_token,
            allow_cookie_access_token=allow_cookie_access_token,
            allow_explicit_token=allow_explicit_token,
        )
        if require_bearer and bearer_claims is None:
            raise AppError(ErrorCode.UNAUTHORIZED, "access token is required")
        session_token = (
            None
            if bearer_claims is not None
            else self._resolve_legacy_session_token(
                query_params=query_params,
                headers=headers,
                cookies=cookies,
                explicit_token=explicit_token,
            )
        )
        if require_session_auth and bearer_claims is None and session_token is None:
            raise AppError(ErrorCode.UNAUTHORIZED, "session authentication is required")
        session_context = None
        if bearer_claims is None and session_token is not None:
            session_context = await self._find_session_context(session_token)
        if session_token is not None and session_context is None and bearer_claims is None:
            if require_session_auth:
                raise AppError(ErrorCode.UNAUTHORIZED, "invalid session token")
            session_token = None

        resolved_home_id = self._resolve_home_id(
            query_params=query_params,
            headers=headers,
            cookies=cookies,
            explicit_home_id=explicit_home_id,
            fallback_home_id=fallback_home_id,
        )
        resolved_terminal_id = self._resolve_terminal_id(
            query_params=query_params,
            headers=headers,
            cookies=cookies,
            explicit_terminal_id=explicit_terminal_id,
        )
        terminal_context = None
        if bearer_claims is not None:
            if resolved_terminal_id is not None and resolved_terminal_id != bearer_claims.terminal_id:
                raise AppError(ErrorCode.UNAUTHORIZED, "terminal context does not match token")
            if resolved_home_id is not None and resolved_home_id != bearer_claims.home_id:
                raise AppError(ErrorCode.UNAUTHORIZED, "home context does not match token")
            resolved_home_id = bearer_claims.home_id
            resolved_terminal_id = bearer_claims.terminal_id
        elif session_context is not None:
            terminal_context = session_context
            if (
                resolved_terminal_id is not None
                and resolved_terminal_id != session_context.terminal_id
            ):
                raise AppError(ErrorCode.UNAUTHORIZED, "terminal context does not match session")
            resolved_terminal_id = session_context.terminal_id
        elif resolved_terminal_id is not None and resolved_home_id is None:
            terminal_context = await self._find_terminal_context(resolved_terminal_id)
            if terminal_context is None:
                raise AppError(ErrorCode.UNAUTHORIZED, "terminal context is invalid")

        if session_context is not None:
            if resolved_home_id is not None and resolved_home_id != session_context.home_id:
                raise AppError(ErrorCode.UNAUTHORIZED, "home context does not match session")
            resolved_home_id = session_context.home_id
        elif terminal_context is not None:
            if resolved_home_id is not None and resolved_home_id != terminal_context.home_id:
                raise AppError(ErrorCode.UNAUTHORIZED, "home context does not match terminal")
            resolved_home_id = terminal_context.home_id

        if require_terminal and resolved_terminal_id is None:
            raise AppError(ErrorCode.UNAUTHORIZED, "terminal context is required")
        if require_home and resolved_home_id is None:
            raise AppError(ErrorCode.UNAUTHORIZED, "home context is required")

        auth_mode = "bearer" if bearer_claims is not None else "legacy_context"
        if session_context is not None:
            auth_mode = "legacy_pin_session"
        return RequestContext(
            home_id=resolved_home_id,
            terminal_id=resolved_terminal_id,
            operator_id=(
                bearer_claims.operator_id
                if bearer_claims is not None
                else session_context.operator_id
                if session_context is not None
                else None
            ),
            session_token=session_token,
            auth_mode=auth_mode,
            access_token_jti=bearer_claims.jti if bearer_claims is not None else None,
            access_token_expires_at=(
                bearer_claims.expires_at if bearer_claims is not None else None
            ),
        )

    async def resolve_http_request(
        self,
        request: Request,
        *,
        explicit_home_id: str | None = None,
        explicit_terminal_id: str | None = None,
        explicit_token: str | None = None,
        fallback_home_id: str | None = None,
        require_home: bool = False,
        require_terminal: bool = False,
        require_bearer: bool = True,
        require_session_auth: bool = False,
    ) -> RequestContext:
        context = await self._resolve_context(
            query_params=request.query_params,
            headers=request.headers,
            cookies=request.cookies,
            explicit_home_id=explicit_home_id,
            explicit_terminal_id=explicit_terminal_id,
            explicit_token=explicit_token,
            fallback_home_id=fallback_home_id,
            require_home=require_home,
            require_terminal=require_terminal,
            require_bearer=require_bearer,
            require_session_auth=require_session_auth,
            required_access_scope="api",
            allow_query_access_token=False,
            allow_cookie_access_token=False,
            allow_explicit_token=False,
        )
        request.state.auth_mode = context.auth_mode
        request.state.access_token_jti = context.access_token_jti
        request.state.home_id = context.home_id
        request.state.terminal_id = context.terminal_id
        request.state.operator_id = context.operator_id
        return context

    async def resolve_websocket_request(
        self,
        websocket: WebSocket,
        *,
        explicit_home_id: str | None = None,
        explicit_terminal_id: str | None = None,
        explicit_token: str | None = None,
        fallback_home_id: str | None = None,
        require_home: bool = False,
        require_terminal: bool = False,
        require_session_auth: bool = False,
    ) -> RequestContext:
        context = await self._resolve_context(
            query_params=websocket.query_params,
            headers=websocket.headers,
            cookies=websocket.cookies,
            explicit_home_id=explicit_home_id,
            explicit_terminal_id=explicit_terminal_id,
            explicit_token=None,
            fallback_home_id=fallback_home_id,
            require_home=require_home,
            require_terminal=require_terminal,
            require_bearer=False,
            require_session_auth=require_session_auth,
            required_access_scope="ws",
            allow_cookie_access_token=False,
            allow_explicit_token=False,
        )
        websocket.state.auth_mode = context.auth_mode
        websocket.state.access_token_jti = context.access_token_jti
        websocket.state.home_id = context.home_id
        websocket.state.terminal_id = context.terminal_id
        websocket.state.operator_id = context.operator_id
        return context
