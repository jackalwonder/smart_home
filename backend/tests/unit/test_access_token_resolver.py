from __future__ import annotations

from datetime import datetime, timezone

import pytest

from src.modules.auth.services.query.AccessTokenResolver import (
    AccessTokenError,
    JwtAccessTokenResolver,
)


def _resolver(ttl_seconds: int = 3600) -> JwtAccessTokenResolver:
    return JwtAccessTokenResolver(
        secret="unit-test-access-secret",
        issuer="smart-home-backend",
        audience="smart-home-web-app",
        ttl_seconds=ttl_seconds,
    )


def test_jwt_access_token_round_trip():
    resolver = _resolver()
    token = resolver.issue(
        home_id="home-1",
        terminal_id="terminal-1",
        operator_id="member-1",
        role="HOME_OWNER",
        scope=("api", "ws"),
    )

    claims = resolver.resolve(token, required_scope="api")

    assert claims is not None
    assert claims.home_id == "home-1"
    assert claims.terminal_id == "terminal-1"
    assert claims.operator_id == "member-1"
    assert claims.role == "HOME_OWNER"
    assert claims.scope == ("api", "ws")
    assert claims.raw_token == token
    assert claims.jti is not None


def test_jwt_access_token_rejects_expired_token():
    resolver = _resolver(ttl_seconds=1)
    token = resolver.issue(
        home_id="home-1",
        terminal_id="terminal-1",
        now=datetime(2020, 1, 1, tzinfo=timezone.utc),
    )

    with pytest.raises(AccessTokenError) as exc_info:
        resolver.resolve(token, required_scope="api")

    assert exc_info.value.reason == "access token expired"


def test_jwt_access_token_rejects_missing_required_scope():
    resolver = _resolver()
    token = resolver.issue(
        home_id="home-1",
        terminal_id="terminal-1",
        scope=("api",),
    )

    with pytest.raises(AccessTokenError) as exc_info:
        resolver.resolve(token, required_scope="ws")

    assert exc_info.value.reason == "required token scope is missing"


def test_jwt_access_token_rejects_tampered_signature():
    resolver = _resolver()
    token = resolver.issue(home_id="home-1", terminal_id="terminal-1")

    with pytest.raises(AccessTokenError) as exc_info:
        resolver.resolve(f"{token}x", required_scope="api")

    assert exc_info.value.reason == "invalid token signature"
