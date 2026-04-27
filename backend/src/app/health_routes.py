from __future__ import annotations

import asyncio
import ipaddress
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import FastAPI, Request
from redis.asyncio import Redis

from src.shared.config.Settings import LOCAL_APP_ENVS, Settings
from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode
from src.shared.http.ResponseEnvelope import SuccessEnvelope, error_response, success_response
from src.shared.observability import get_observability_metrics


async def run_readiness_check(check: Callable[[], Awaitable[None]]) -> dict[str, str]:
    try:
        await check()
    except Exception as exc:
        return {
            "status": "unavailable",
            "error_type": exc.__class__.__name__,
        }
    return {"status": "ok"}


async def check_redis(redis_url: str, timeout_seconds: float) -> None:
    client = Redis.from_url(
        redis_url,
        socket_connect_timeout=timeout_seconds,
        socket_timeout=timeout_seconds,
    )
    try:
        await client.ping()
    finally:
        await client.aclose()


def is_observability_client_allowed(client_host: str | None, cidrs_config: str) -> bool:
    if client_host is None:
        return False
    try:
        host_addr = ipaddress.ip_address(client_host)
    except ValueError:
        return False
    for cidr in cidrs_config.split(","):
        try:
            if host_addr in ipaddress.ip_network(cidr.strip()):
                return True
        except ValueError:
            continue
    return False


def register_health_routes(
    app: FastAPI,
    settings: Settings,
    *,
    database_getter,
    redis_checker=check_redis,
) -> None:
    @app.get("/healthz", response_model=SuccessEnvelope[dict[str, str]])
    async def healthz(request: Request):
        return success_response(
            request,
            {
                "status": "ok",
                "app_env": settings.app_env,
            },
        )

    @app.get("/readyz", response_model=SuccessEnvelope[dict[str, Any]])
    async def readyz(request: Request):
        timeout_seconds = settings.readiness_check_timeout_seconds
        database_check, redis_check = await asyncio.gather(
            run_readiness_check(
                lambda: asyncio.wait_for(database_getter().check(), timeout=timeout_seconds),
            ),
            run_readiness_check(
                lambda: asyncio.wait_for(
                    redis_checker(settings.redis_url, timeout_seconds),
                    timeout=timeout_seconds,
                ),
            ),
        )
        checks = {
            "database": database_check,
            "redis": redis_check,
        }
        if any(check["status"] != "ok" for check in checks.values()):
            return error_response(
                request,
                str(ErrorCode.INTERNAL_SERVER_ERROR),
                "服务未就绪",
                details={"checks": checks},
                status_code=503,
            )
        return success_response(
            request,
            {
                "status": "ready",
                "app_env": settings.app_env,
                "checks": checks,
            },
        )

    @app.get(
        "/observabilityz",
        response_model=SuccessEnvelope[dict[str, Any]],
        include_in_schema=False,
    )
    async def observabilityz(request: Request):
        normalized_env = settings.app_env.strip().lower()
        if normalized_env not in LOCAL_APP_ENVS:
            client_host = request.client.host if request.client else None
            if not is_observability_client_allowed(
                client_host, settings.observability_allowed_cidrs
            ):
                raise AppError(ErrorCode.FORBIDDEN, "observabilityz is restricted")
        return success_response(request, get_observability_metrics().snapshot())
