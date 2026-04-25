from __future__ import annotations

from types import SimpleNamespace
from types import MethodType

import pytest

from src.modules.auth.services.query.AccessTokenResolver import JwtAccessTokenResolver
from src.modules.auth.services.query.RequestContextService import (
    RequestContext,
    RequestContextService,
)
from src.repositories.query.auth.RequestContextRepository import RequestContextLookupRow
from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode


def _resolver() -> JwtAccessTokenResolver:
    return JwtAccessTokenResolver(
        secret="unit-test-access-secret",
        issuer="smart-home-backend",
        audience="smart-home-web-app",
        ttl_seconds=3600,
    )


class FakeRequestContextRepository:
    def __init__(self) -> None:
        self.terminal_contexts: dict[str, RequestContextLookupRow] = {}
        self.session_contexts: dict[str, RequestContextLookupRow] = {}
        self.device_home_ids: dict[str, str] = {}
        self.control_request_home_ids: dict[str, str] = {}

    async def find_terminal_context(self, terminal_id: str):
        return self.terminal_contexts.get(terminal_id)

    async def find_session_context(self, session_token: str):
        return self.session_contexts.get(session_token)

    async def find_home_id_by_device_id(self, device_id: str):
        return self.device_home_ids.get(device_id)

    async def find_home_id_by_control_request_id(self, request_id: str):
        return self.control_request_home_ids.get(request_id)


def _repository() -> FakeRequestContextRepository:
    return FakeRequestContextRepository()


def _service() -> RequestContextService:
    return RequestContextService(
        request_context_repository=_repository(),
        access_token_resolver=_resolver(),
    )


def _request(*, query_params=None, headers=None, cookies=None):
    return SimpleNamespace(
        query_params=query_params or {},
        headers=headers or {},
        cookies=cookies or {},
        state=SimpleNamespace(),
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
        request_context_repository=_repository(),
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
        request_context_repository=_repository(),
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
async def test_http_runtime_requires_authorization_bearer_by_default():
    service = _service()

    with pytest.raises(AppError) as exc_info:
        await service.resolve_http_request(
            _request(
                query_params={
                    "home_id": "home-1",
                    "terminal_id": "terminal-1",
                    "token": "pin-session-1",
                },
            ),
            require_home=True,
            require_terminal=True,
        )

    assert exc_info.value.code == ErrorCode.UNAUTHORIZED
    assert exc_info.value.message == "access token is required"


@pytest.mark.asyncio
async def test_http_runtime_rejects_query_access_token_transport():
    resolver = _resolver()
    token = resolver.issue(home_id="home-1", terminal_id="terminal-1", scope=("api", "ws"))
    service = RequestContextService(
        request_context_repository=_repository(),
        access_token_resolver=resolver,
    )

    with pytest.raises(AppError) as exc_info:
        await service.resolve_http_request(
            _request(query_params={"access_token": token}),
            require_home=True,
            require_terminal=True,
        )

    assert exc_info.value.code == ErrorCode.UNAUTHORIZED
    assert exc_info.value.message == "access token is required"


@pytest.mark.asyncio
async def test_auth_bootstrap_can_still_use_legacy_context_when_bearer_not_required():
    service = _service()

    context = await service.resolve_http_request(
        _request(query_params={"home_id": "home-1", "terminal_id": "terminal-1"}),
        require_home=True,
        require_terminal=True,
        require_bearer=False,
    )

    assert context.home_id == "home-1"
    assert context.terminal_id == "terminal-1"
    assert context.auth_mode == "legacy_context"


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
async def test_websocket_subprotocol_can_carry_bearer_jwt():
    resolver = _resolver()
    token = resolver.issue(
        home_id="home-1",
        terminal_id="terminal-1",
        scope=("api", "ws"),
    )
    service = RequestContextService(
        request_context_repository=_repository(),
        access_token_resolver=resolver,
    )

    context = await service.resolve_websocket_request(
        _request(headers={"sec-websocket-protocol": f"bearer, {token}"}),
        require_home=True,
        require_terminal=True,
        require_session_auth=True,
    )

    assert context.auth_mode == "bearer"
    assert context.home_id == "home-1"
    assert context.terminal_id == "terminal-1"


@pytest.mark.asyncio
async def test_websocket_query_access_token_is_legacy_compatible():
    resolver = _resolver()
    token = resolver.issue(
        home_id="home-1",
        terminal_id="terminal-1",
        scope=("api", "ws"),
    )
    service = RequestContextService(
        request_context_repository=_repository(),
        access_token_resolver=resolver,
    )

    context = await service.resolve_websocket_request(
        _request(query_params={"access_token": token}),
        require_home=True,
        require_terminal=True,
        require_session_auth=True,
    )

    assert context.auth_mode == "bearer"
    assert context.home_id == "home-1"
    assert context.terminal_id == "terminal-1"


@pytest.mark.asyncio
async def test_websocket_cookie_access_token_is_not_accepted():
    resolver = _resolver()
    token = resolver.issue(
        home_id="home-1",
        terminal_id="terminal-1",
        scope=("api", "ws"),
    )
    service = RequestContextService(
        request_context_repository=_repository(),
        access_token_resolver=resolver,
    )

    with pytest.raises(AppError) as exc_info:
        await service.resolve_websocket_request(
            _request(cookies={"access_token": token}),
            require_home=True,
            require_terminal=True,
            require_session_auth=True,
        )

    assert exc_info.value.code == ErrorCode.UNAUTHORIZED
    assert exc_info.value.message == "session authentication is required"


@pytest.mark.asyncio
async def test_websocket_explicit_token_is_not_accepted():
    resolver = _resolver()
    token = resolver.issue(
        home_id="home-1",
        terminal_id="terminal-1",
        scope=("api", "ws"),
    )
    service = RequestContextService(
        request_context_repository=_repository(),
        access_token_resolver=resolver,
    )

    with pytest.raises(AppError) as exc_info:
        await service.resolve_websocket_request(
            _request(),
            explicit_token=token,
            require_home=True,
            require_terminal=True,
            require_session_auth=True,
        )

    assert exc_info.value.code == ErrorCode.UNAUTHORIZED
    assert exc_info.value.message == "session authentication is required"


@pytest.mark.asyncio
async def test_internal_context_can_still_resolve_explicit_ws_token():
    resolver = _resolver()
    token = resolver.issue(
        home_id="home-1",
        terminal_id="terminal-1",
        scope=("api", "ws"),
    )
    service = RequestContextService(
        request_context_repository=_repository(),
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


@pytest.mark.asyncio
async def test_terminal_fallback_uses_request_context_repository():
    repository = _repository()
    repository.terminal_contexts["terminal-1"] = RequestContextLookupRow(
        home_id="home-1",
        terminal_id="terminal-1",
    )
    service = RequestContextService(
        request_context_repository=repository,
        access_token_resolver=_resolver(),
    )

    context = await service._resolve_context(
        query_params={"terminal_id": "terminal-1"},
        headers={},
        cookies={},
        require_home=True,
        require_terminal=True,
        required_access_scope="api",
    )

    assert context.home_id == "home-1"
    assert context.terminal_id == "terminal-1"


@pytest.mark.asyncio
async def test_home_lookup_helpers_use_request_context_repository():
    repository = _repository()
    repository.device_home_ids["device-1"] = "home-1"
    repository.control_request_home_ids["request-1"] = "home-2"
    service = RequestContextService(
        request_context_repository=repository,
        access_token_resolver=_resolver(),
    )

    assert await service.find_home_id_by_device_id("device-1") == "home-1"
    assert await service.find_home_id_by_control_request_id("request-1") == "home-2"
