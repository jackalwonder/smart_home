from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from starlette.datastructures import Headers, QueryParams

from src.app import rate_limit_middleware
from src.app.rate_limit_middleware import RedisRateLimiter, _client_identity, _rate_limit_scope
from src.shared.config.Settings import Settings
from src.shared.http.ResponseEnvelope import success_response


class _FakeRedis:
    def __init__(self) -> None:
        self.counts: dict[str, int] = {}
        self.expirations: dict[str, int] = {}

    async def incr(self, key: str) -> int:
        self.counts[key] = self.counts.get(key, 0) + 1
        return self.counts[key]

    async def expire(self, key: str, seconds: int) -> None:
        self.expirations[key] = seconds

    async def ttl(self, key: str) -> int:
        return self.expirations.get(key, 60)

    async def aclose(self) -> None:
        return None


class _FailingRedis:
    async def incr(self, _key: str) -> int:
        raise RuntimeError("redis unavailable")

    async def expire(self, _key: str, _seconds: int) -> None:
        return None

    async def ttl(self, _key: str) -> int:
        return 60

    async def aclose(self) -> None:
        return None


def _request(path: str, *, method: str = "GET", client_host: str = "127.0.0.1"):
    return SimpleNamespace(
        method=method,
        url=SimpleNamespace(path=path),
        headers=Headers({"x-forwarded-for": "203.0.113.10"}),
        query_params=QueryParams({}),
        cookies={},
        client=SimpleNamespace(host=client_host),
    )


def _settings(**overrides) -> Settings:
    values = {
        "rate_limit_enabled": True,
        "rate_limit_window_seconds": 60,
        "rate_limit_global_per_minute": 100,
        "rate_limit_auth_per_minute": 2,
        "rate_limit_pin_per_minute": 2,
        "rate_limit_bootstrap_per_minute": 2,
        "rate_limit_pairing_per_minute": 2,
        "rate_limit_upload_per_minute": 2,
        "rate_limit_file_download_per_minute": 2,
    }
    values.update(overrides)
    return Settings(_env_file=None, app_env="local", **values)


@pytest.mark.parametrize(
    ("path", "method", "scope"),
    [
        ("/api/v1/auth/session", "GET", "auth"),
        ("/api/v1/auth/session/bootstrap", "POST", "bootstrap"),
        ("/api/v1/auth/pin/verify", "POST", "pin"),
        ("/api/v1/auth/pin/session", "GET", "runtime"),
        ("/api/v1/terminals/terminal-1/bootstrap-token", "POST", "bootstrap"),
        ("/api/v1/terminals/terminal-1/pairing-code-sessions", "POST", "pairing"),
        ("/api/v1/terminals/pairing-code-claims", "POST", "pairing"),
        ("/api/v1/page-assets/floorplan", "POST", "upload"),
        ("/api/v1/page-assets/floorplan/asset-1/file", "GET", "file_download"),
        ("/api/v1/settings/sgcc-login-qrcode/file", "GET", "file_download"),
        ("/api/v1/home/overview", "GET", "runtime"),
        ("/readyz", "GET", None),
    ],
)
def test_rate_limit_scope_classification(path: str, method: str, scope: str | None):
    assert _rate_limit_scope(_request(path, method=method)) == scope


def test_rate_limit_identity_ignores_spoofable_forwarded_for_header():
    assert _client_identity(_request("/api/v1/auth/session", client_host="10.0.0.1")) == "10.0.0.1"


@pytest.mark.asyncio
async def test_rate_limiter_blocks_when_scoped_limit_is_exceeded():
    redis = _FakeRedis()
    limiter = RedisRateLimiter(_settings(rate_limit_auth_per_minute=1), redis_client=redis)
    request = _request("/api/v1/auth/session", client_host="10.0.0.1")

    first = await limiter.check(request)
    second = await limiter.check(request)

    assert first.allowed is True
    assert second.allowed is False
    assert second.scope == "auth"
    assert second.limit == 1
    assert second.retry_after_seconds == 60


@pytest.mark.asyncio
async def test_rate_limiter_applies_global_fallback_to_runtime_routes():
    redis = _FakeRedis()
    limiter = RedisRateLimiter(_settings(rate_limit_global_per_minute=1), redis_client=redis)
    request = _request("/api/v1/home/overview", client_host="10.0.0.2")

    first = await limiter.check(request)
    second = await limiter.check(request)

    assert first.allowed is True
    assert second.allowed is False
    assert second.scope == "global"


@pytest.mark.asyncio
async def test_rate_limiter_fail_opens_when_redis_is_unavailable():
    limiter = RedisRateLimiter(_settings(), redis_client=_FailingRedis())

    decision = await limiter.check(_request("/api/v1/auth/session"))

    assert decision.allowed is True


def test_rate_limit_middleware_returns_uniform_429(monkeypatch: pytest.MonkeyPatch):
    redis = _FakeRedis()
    monkeypatch.setattr(rate_limit_middleware.Redis, "from_url", lambda *_args, **_kwargs: redis)

    app = FastAPI()
    rate_limit_middleware.register_rate_limit_middleware(
        app,
        _settings(rate_limit_auth_per_minute=1),
    )

    @app.get("/api/v1/auth/session")
    async def auth_session(request: Request):
        return success_response(request, {"ok": True})

    with TestClient(app) as client:
        first = client.get("/api/v1/auth/session")
        second = client.get("/api/v1/auth/session")

    assert first.status_code == 200
    assert second.status_code == 429
    assert second.headers["Retry-After"] == "60"
    body = second.json()
    assert body["success"] is False
    assert body["error"]["code"] == "RATE_LIMITED"
    assert body["error"]["details"]["scope"] == "auth"
