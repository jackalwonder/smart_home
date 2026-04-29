from __future__ import annotations

import hashlib
import logging
import time
from dataclasses import dataclass
from typing import Protocol

from fastapi import FastAPI, Request
from redis.asyncio import Redis

from src.shared.config.Settings import Settings
from src.shared.errors.ErrorCode import ErrorCode
from src.shared.http.ResponseEnvelope import error_response

logger = logging.getLogger(__name__)


class RedisLike(Protocol):
    async def incr(self, key: str) -> int: ...

    async def expire(self, key: str, seconds: int) -> object: ...

    async def ttl(self, key: str) -> int: ...

    async def aclose(self) -> object: ...


@dataclass(frozen=True)
class RateLimitRule:
    scope: str
    limit: int
    window_seconds: int


@dataclass(frozen=True)
class RateLimitDecision:
    allowed: bool
    scope: str | None = None
    limit: int | None = None
    retry_after_seconds: int | None = None


def _client_identity(request: Request) -> str:
    # Do not trust forwarded headers here; Compose exposes the backend port directly.
    if request.client is not None and request.client.host:
        return request.client.host
    return "unknown"


def _rate_limit_scope(request: Request) -> str | None:
    method = request.method.upper()
    path = request.url.path
    if not path.startswith("/api/"):
        return None

    if method == "POST" and path.startswith("/api/v1/auth/pin/verify"):
        return "pin"
    if path == "/api/v1/auth/session/bootstrap":
        return "bootstrap"
    if path.startswith("/api/v1/auth/session"):
        return "auth"
    if path.startswith("/api/v1/terminals/") and "bootstrap-token" in path:
        return "bootstrap"
    if path.startswith("/api/v1/terminals/") and "pairing-code" in path:
        return "pairing"
    if method == "POST" and path in {
        "/api/v1/page-assets/floorplan",
        "/api/v1/page-assets/hotspot-icons",
    }:
        return "upload"
    if method == "GET" and (
        (
            path.startswith("/api/v1/page-assets/")
            and (
                path.startswith("/api/v1/page-assets/floorplan/")
                or path.startswith("/api/v1/page-assets/hotspot-icons/")
            )
            and path.endswith("/file")
        )
        or path == "/api/v1/settings/sgcc-login-qrcode/file"
    ):
        return "file_download"
    return "runtime"


class RedisRateLimiter:
    def __init__(
        self,
        settings: Settings,
        *,
        redis_client: RedisLike | None = None,
    ) -> None:
        self._settings = settings
        self._redis_client = redis_client
        self._owns_client = redis_client is None

    def _client(self) -> RedisLike:
        if self._redis_client is None:
            self._redis_client = Redis.from_url(
                self._settings.redis_url,
                socket_connect_timeout=self._settings.rate_limit_redis_timeout_seconds,
                socket_timeout=self._settings.rate_limit_redis_timeout_seconds,
                decode_responses=True,
            )
        return self._redis_client

    def _rules_for_scope(self, scope: str) -> list[RateLimitRule]:
        window_seconds = self._settings.rate_limit_window_seconds
        rules = [
            RateLimitRule(
                scope="global",
                limit=self._settings.rate_limit_global_per_minute,
                window_seconds=window_seconds,
            )
        ]
        scoped_limits = {
            "auth": self._settings.rate_limit_auth_per_minute,
            "pin": self._settings.rate_limit_pin_per_minute,
            "bootstrap": self._settings.rate_limit_bootstrap_per_minute,
            "pairing": self._settings.rate_limit_pairing_per_minute,
            "upload": self._settings.rate_limit_upload_per_minute,
            "file_download": self._settings.rate_limit_file_download_per_minute,
        }
        scoped_limit = scoped_limits.get(scope)
        if scoped_limit is not None:
            rules.append(
                RateLimitRule(
                    scope=scope,
                    limit=scoped_limit,
                    window_seconds=window_seconds,
                )
            )
        return [rule for rule in rules if rule.limit > 0 and rule.window_seconds > 0]

    async def _consume(self, rule: RateLimitRule, identity_hash: str) -> RateLimitDecision:
        window = int(time.time() // rule.window_seconds)
        key = f"smart-home:rate-limit:{rule.scope}:{identity_hash}:{window}"
        client = self._client()
        count = await client.incr(key)
        if count == 1:
            await client.expire(key, rule.window_seconds)
        if count <= rule.limit:
            return RateLimitDecision(allowed=True)
        ttl = await client.ttl(key)
        retry_after = ttl if ttl > 0 else rule.window_seconds
        return RateLimitDecision(
            allowed=False,
            scope=rule.scope,
            limit=rule.limit,
            retry_after_seconds=retry_after,
        )

    async def check(self, request: Request) -> RateLimitDecision:
        if not self._settings.rate_limit_enabled:
            return RateLimitDecision(allowed=True)
        scope = _rate_limit_scope(request)
        if scope is None:
            return RateLimitDecision(allowed=True)

        identity_hash = hashlib.sha256(_client_identity(request).encode("utf-8")).hexdigest()[:24]
        try:
            for rule in self._rules_for_scope(scope):
                decision = await self._consume(rule, identity_hash)
                if not decision.allowed:
                    return decision
        except Exception:
            logger.warning("Rate limit check failed; allowing request", exc_info=True)
        return RateLimitDecision(allowed=True)

    async def close(self) -> None:
        if self._owns_client and self._redis_client is not None:
            await self._redis_client.aclose()
            self._redis_client = None


def register_rate_limit_middleware(app: FastAPI, settings: Settings) -> None:
    limiter = RedisRateLimiter(settings)
    app.state.rate_limiter = limiter

    @app.middleware("http")
    async def enforce_rate_limit(request: Request, call_next):
        decision = await limiter.check(request)
        if decision.allowed:
            return await call_next(request)

        request.state.error_code = str(ErrorCode.RATE_LIMITED)
        response = error_response(
            request,
            str(ErrorCode.RATE_LIMITED),
            "请求过于频繁，请稍后再试",
            details={
                "scope": decision.scope,
                "limit": decision.limit,
                "retry_after_seconds": decision.retry_after_seconds,
            },
            status_code=429,
        )
        if decision.retry_after_seconds is not None:
            response.headers["Retry-After"] = str(decision.retry_after_seconds)
        return response


async def close_rate_limit_middleware(app: FastAPI) -> None:
    limiter = getattr(app.state, "rate_limiter", None)
    if limiter is not None:
        await limiter.close()
