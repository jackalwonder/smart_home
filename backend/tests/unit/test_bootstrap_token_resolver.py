from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from src.modules.auth.services.query.BootstrapTokenResolver import (
    BootstrapTokenError,
    JwtBootstrapTokenResolver,
)


def _resolver(*, ttl_seconds: int = 3600) -> JwtBootstrapTokenResolver:
    return JwtBootstrapTokenResolver(
        secret="unit-test-bootstrap-secret",
        issuer="smart-home-backend",
        audience="smart-home-web-app",
        ttl_seconds=ttl_seconds,
    )


def test_bootstrap_token_round_trip():
    resolver = _resolver()
    token = resolver.issue(
        home_id="home-1",
        terminal_id="terminal-1",
        terminal_mode="KIOSK",
    )

    claims = resolver.resolve(token, required_scope="bootstrap:session")

    assert claims is not None
    assert claims.home_id == "home-1"
    assert claims.terminal_id == "terminal-1"
    assert claims.terminal_mode == "KIOSK"
    assert claims.scope == ("bootstrap:session",)
    assert claims.jti
    assert resolver.hash_token(token) == resolver.hash_token(token)


def test_bootstrap_token_rejects_expired_token():
    resolver = _resolver(ttl_seconds=1)
    token = resolver.issue(
        home_id="home-1",
        terminal_id="terminal-1",
        terminal_mode="KIOSK",
        now=datetime.now(timezone.utc) - timedelta(seconds=10),
    )

    with pytest.raises(BootstrapTokenError):
        resolver.resolve(token, required_scope="bootstrap:session")


def test_bootstrap_token_rejects_wrong_required_scope():
    resolver = _resolver()
    token = resolver.issue(
        home_id="home-1",
        terminal_id="terminal-1",
        terminal_mode="KIOSK",
    )

    with pytest.raises(BootstrapTokenError):
        resolver.resolve(token, required_scope="runtime:api")


def test_bootstrap_token_rejects_tampered_signature():
    resolver = _resolver()
    token = resolver.issue(
        home_id="home-1",
        terminal_id="terminal-1",
        terminal_mode="KIOSK",
    )

    with pytest.raises(BootstrapTokenError):
        resolver.resolve(f"{token}tampered", required_scope="bootstrap:session")
