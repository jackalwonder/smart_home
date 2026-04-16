from __future__ import annotations

from datetime import datetime, timezone

import httpx
import pytest

from src.infrastructure.weather.impl.OpenMeteoWeatherProvider import OpenMeteoWeatherProvider
from src.shared.config.Settings import Settings


class _Clock:
    def now(self) -> datetime:
        return datetime(2026, 4, 16, 8, 0, 0, tzinfo=timezone.utc)


class _TimeoutAsyncClient:
    def __init__(self, **_kwargs) -> None:
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args) -> None:
        return None

    async def get(self, *_args, **_kwargs):
        raise httpx.ConnectTimeout("weather unavailable")


class _SuccessAsyncClient:
    def __init__(self, **_kwargs) -> None:
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args) -> None:
        return None

    async def get(self, *_args, **_kwargs):
        return httpx.Response(
            200,
            json={
                "current": {
                    "temperature_2m": 23.6,
                    "relative_humidity_2m": 58,
                    "weather_code": 3,
                }
            },
            request=httpx.Request("GET", "https://example.test/weather"),
        )


@pytest.mark.asyncio
async def test_open_meteo_provider_degrades_when_weather_source_times_out(monkeypatch):
    monkeypatch.setattr(httpx, "AsyncClient", _TimeoutAsyncClient)

    provider = OpenMeteoWeatherProvider(Settings(), _Clock())

    snapshot = await provider.get_sidebar_weather("home-1")

    assert snapshot is not None
    assert snapshot.cache_mode is True
    assert snapshot.fetched_at == "2026-04-16T08:00:00+00:00"
    assert snapshot.temperature is None
    assert snapshot.condition is None
    assert snapshot.humidity is None


@pytest.mark.asyncio
async def test_open_meteo_provider_maps_successful_weather_response(monkeypatch):
    monkeypatch.setattr(httpx, "AsyncClient", _SuccessAsyncClient)

    provider = OpenMeteoWeatherProvider(Settings(), _Clock())

    snapshot = await provider.get_sidebar_weather("home-1")

    assert snapshot is not None
    assert snapshot.cache_mode is False
    assert snapshot.temperature == 23
    assert snapshot.condition == "3"
    assert snapshot.humidity == 58
