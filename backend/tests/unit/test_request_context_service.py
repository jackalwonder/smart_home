from __future__ import annotations

from types import MethodType

import pytest

from src.modules.auth.services.query.AccessTokenResolver import JwtAccessTokenResolver
from src.modules.auth.services.query.RequestContextService import (
    RequestContext,
    RequestContextService,
)
from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode


def _resolver() -> JwtAccessTokenResolver:
    return JwtAccessTokenResolver(
        secret="unit-test-access-secret",
        issuer="smart-home-backend",
        audience="smart-home-web-app",
        ttl_seconds=3600,
    )


def _service() -> RequestContextService:
    return RequestContextService(
        database=object(),  # type: ignore[arg-type]
        access_token_resolver=_resolver(),
    )


@pytest.mark.asyncio
async def test_bearer_claims_are_authoritative_context():
    resolver = _resolver()
    token = resolver.issue(
        home_id="home-1",
        terminal_id="terminal-1",
        operator_id="member-1",
    )
    service = RequestContextService(
        database=object(),  # type: ignore[arg-type]
        access_token_resolver=resolver,
    )

    context = await service._resolve_context(
        query_params={},
        headers={"authorization": f"Bearer {token}"},
        cookies={},
        require_home=True,
        require_terminal=True,
        required_access_scope="api",
    )

    assert context.home_id == "home-1"
    assert context.terminal_id == "terminal-1"
    assert context.operator_id == "member-1"
    assert context.auth_mode == "bearer"
    assert context.session_token is None
    assert context.access_token_jti is not None


@pytest.mark.asyncio
async def test_bearer_rejects_mismatched_legacy_context_fields():
    resolver = _resolver()
    token = resolver.issue(home_id="home-1", terminal_id="terminal-1")
    service = RequestContextService(
        database=object(),  # type: ignore[arg-type]
        access_token_resolver=resolver,
    )

    with pytest.raises(AppError) as exc_info:
        await service._resolve_context(
            query_params={"home_id": "home-2", "terminal_id": "terminal-1"},
            headers={"authorization": f"Bearer {token}"},
            cookies={},
            require_home=True,
            require_terminal=True,
            required_access_scope="api",
        )

    assert exc_info.value.code == ErrorCode.UNAUTHORIZED
    assert exc_info.value.message == "home context does not match token"


@pytest.mark.asyncio
async def test_strict_invalid_bearer_does_not_fall_back_to_legacy_cookie():
    service = _service()

    with pytest.raises(AppError) as exc_info:
        await service._resolve_context(
            query_params={},
            headers={"authorization": "Bearer not-a-jwt"},
            cookies={"pin_session_token": "pin-session-1"},
            require_home=True,
            require_terminal=True,
            require_session_auth=True,
            required_access_scope="api",
        )

    assert exc_info.value.code == ErrorCode.UNAUTHORIZED
    assert exc_info.value.message == "invalid access token"


@pytest.mark.asyncio
async def test_legacy_pin_session_path_remains_available():
    service = _service()

    async def _find_session_context(self, session_token: str):
        assert session_token == "pin-session-1"
        return RequestContext(
            home_id="home-1",
            terminal_id="terminal-1",
            operator_id="member-1",
            session_token=session_token,
        )

    service._find_session_context = MethodType(_find_session_context, service)  # type: ignore[method-assign]

    context = await service._resolve_context(
        query_params={
            "home_id": "home-1",
            "terminal_id": "terminal-1",
            "token": "pin-session-1",
        },
        headers={},
        cookies={},
        require_home=True,
        require_terminal=True,
        require_session_auth=True,
        required_access_scope="api",
    )

    assert context.home_id == "home-1"
    assert context.terminal_id == "terminal-1"
    assert context.operator_id == "member-1"
    assert context.session_token == "pin-session-1"
    assert context.auth_mode == "legacy_pin_session"


@pytest.mark.asyncio
async def test_invalid_legacy_session_cookie_falls_back_to_context_when_session_not_required():
    service = _service()

    async def _find_session_context(self, session_token: str):
        assert session_token == "stale-session-token"
        return None

    service._find_session_context = MethodType(_find_session_context, service)  # type: ignore[method-assign]

    context = await service._resolve_context(
        query_params={
            "home_id": "home-1",
            "terminal_id": "terminal-1",
        },
        headers={},
        cookies={"pin_session_token": "stale-session-token"},
        require_home=True,
        require_terminal=True,
        require_session_auth=False,
        required_access_scope="api",
    )

    assert context.home_id == "home-1"
    assert context.terminal_id == "terminal-1"
    assert context.session_token is None
    assert context.auth_mode == "legacy_context"


@pytest.mark.asyncio
async def test_invalid_legacy_session_cookie_remains_strict_when_session_required():
    service = _service()

    async def _find_session_context(self, session_token: str):
        assert session_token == "stale-session-token"
        return None

    service._find_session_context = MethodType(_find_session_context, service)  # type: ignore[method-assign]

    with pytest.raises(AppError) as exc_info:
        await service._resolve_context(
            query_params={
                "home_id": "home-1",
                "terminal_id": "terminal-1",
            },
            headers={},
            cookies={"pin_session_token": "stale-session-token"},
            require_home=True,
            require_terminal=True,
            require_session_auth=True,
            required_access_scope="api",
        )

    assert exc_info.value.code == ErrorCode.UNAUTHORIZED
    assert exc_info.value.message == "invalid session token"


@pytest.mark.asyncio
async def test_websocket_token_query_can_carry_bearer_jwt():
    resolver = _resolver()
    token = resolver.issue(
        home_id="home-1",
        terminal_id="terminal-1",
        scope=("api", "ws"),
    )
    service = RequestContextService(
        database=object(),  # type: ignore[arg-type]
        access_token_resolver=resolver,
    )

    context = await service._resolve_context(
        query_params={},
        headers={},
        cookies={},
        explicit_home_id="home-1",
        explicit_terminal_id="terminal-1",
        explicit_token=token,
        require_home=True,
        require_terminal=True,
        require_session_auth=True,
        required_access_scope="ws",
    )

    assert context.auth_mode == "bearer"
    assert context.home_id == "home-1"
    assert context.terminal_id == "terminal-1"
