from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Mapping

from fastapi import Request, WebSocket
from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import session_scope
from src.modules.auth.services.query.AccessTokenResolver import (
    AccessTokenClaims,
    AccessTokenResolver,
    NoopAccessTokenResolver,
)
from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode


@dataclass(frozen=True)
class RequestContext:
    home_id: str | None
    terminal_id: str | None
    operator_id: str | None = None
    session_token: str | None = None


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


class RequestContextService:
    def __init__(
        self,
        database: Database,
        access_token_resolver: AccessTokenResolver | None = None,
    ) -> None:
        self._database = database
        self._access_token_resolver = access_token_resolver or NoopAccessTokenResolver()

    def _resolve_bearer_token(
        self,
        *,
        query_params: Mapping[str, str],
        headers: Mapping[str, str],
        cookies: Mapping[str, str],
    ) -> str | None:
        authorization = _header(headers, "authorization")
        if authorization is not None and authorization.lower().startswith("bearer "):
            return _normalize(authorization[7:])
        return _query(query_params, "access_token") or _cookie(cookies, "access_token")

    def _resolve_legacy_session_token(
        self,
        *,
        query_params: Mapping[str, str],
        headers: Mapping[str, str],
        cookies: Mapping[str, str],
        explicit_token: str | None = None,
    ) -> str | None:
        bearer_token = None
        authorization = _header(headers, "authorization")
        if authorization is not None and authorization.lower().startswith("bearer "):
            bearer_token = _normalize(authorization[7:])
        return (
            _normalize(explicit_token)
            or bearer_token
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
    ) -> AccessTokenClaims | None:
        bearer_token = self._resolve_bearer_token(
            query_params=query_params,
            headers=headers,
            cookies=cookies,
        )
        if bearer_token is None:
            return None
        claims = self._access_token_resolver.resolve(bearer_token)
        if claims is None:
            return None
        if claims.raw_token is None:
            return AccessTokenClaims(
                home_id=claims.home_id,
                terminal_id=claims.terminal_id,
                operator_id=claims.operator_id,
                raw_token=bearer_token,
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
        stmt = text(
            """
            SELECT
                home_id::text AS home_id,
                id::text AS terminal_id
            FROM terminals
            WHERE id = :terminal_id
            """
        )
        async with session_scope(self._database) as (session, _):
            row = (
                await session.execute(stmt, {"terminal_id": terminal_id})
            ).mappings().one_or_none()
        if row is None:
            return None
        return RequestContext(
            home_id=row["home_id"],
            terminal_id=row["terminal_id"],
        )

    async def _find_session_context(self, session_token: str) -> RequestContext | None:
        stmt = text(
            """
            SELECT
                home_id::text AS home_id,
                terminal_id::text AS terminal_id,
                member_id::text AS operator_id
            FROM pin_sessions
            WHERE session_token_hash = :session_token
              AND is_active = true
              AND expires_at > :now
            ORDER BY verified_at DESC
            LIMIT 1
            """
        )
        async with session_scope(self._database) as (session, _):
            row = (
                await session.execute(
                    stmt,
                    {
                        "session_token": session_token,
                        "now": datetime.now(timezone.utc),
                    },
                )
            ).mappings().one_or_none()
        if row is None:
            return None
        return RequestContext(
            home_id=row["home_id"],
            terminal_id=row["terminal_id"],
            operator_id=row["operator_id"],
            session_token=session_token,
        )

    async def find_home_id_by_device_id(self, device_id: str) -> str | None:
        stmt = text(
            """
            SELECT home_id::text AS home_id
            FROM devices
            WHERE id = :device_id
            """
        )
        async with session_scope(self._database) as (session, _):
            row = (
                await session.execute(stmt, {"device_id": device_id})
            ).mappings().one_or_none()
        return row["home_id"] if row is not None else None

    async def find_home_id_by_control_request_id(self, request_id: str) -> str | None:
        stmt = text(
            """
            SELECT home_id::text AS home_id
            FROM device_control_requests
            WHERE request_id = :request_id
            ORDER BY created_at DESC
            LIMIT 1
            """
        )
        async with session_scope(self._database) as (session, _):
            row = (
                await session.execute(stmt, {"request_id": request_id})
            ).mappings().one_or_none()
        return row["home_id"] if row is not None else None

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
        require_session_auth: bool = False,
    ) -> RequestContext:
        bearer_claims = self._resolve_bearer_claims(
            query_params=query_params,
            headers=headers,
            cookies=cookies,
        )
        session_token = self._resolve_legacy_session_token(
            query_params=query_params,
            headers=headers,
            cookies=cookies,
            explicit_token=explicit_token,
        )
        if require_session_auth and bearer_claims is None and session_token is None:
            raise AppError(ErrorCode.UNAUTHORIZED, "session authentication is required")
        session_context = None
        if bearer_claims is None and session_token is not None:
            session_context = await self._find_session_context(session_token)
        if session_token is not None and session_context is None and bearer_claims is None:
            raise AppError(ErrorCode.UNAUTHORIZED, "invalid session token")

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
        require_session_auth: bool = False,
    ) -> RequestContext:
        return await self._resolve_context(
            query_params=request.query_params,
            headers=request.headers,
            cookies=request.cookies,
            explicit_home_id=explicit_home_id,
            explicit_terminal_id=explicit_terminal_id,
            explicit_token=explicit_token,
            fallback_home_id=fallback_home_id,
            require_home=require_home,
            require_terminal=require_terminal,
            require_session_auth=require_session_auth,
        )

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
        return await self._resolve_context(
            query_params=websocket.query_params,
            headers=websocket.headers,
            cookies=websocket.cookies,
            explicit_home_id=explicit_home_id,
            explicit_terminal_id=explicit_terminal_id,
            explicit_token=explicit_token,
            fallback_home_id=fallback_home_id,
            require_home=require_home,
            require_terminal=require_terminal,
            require_session_auth=require_session_auth,
        )
