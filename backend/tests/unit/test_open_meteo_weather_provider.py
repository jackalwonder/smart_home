from __future__ import annotations

from datetime import datetime, timezone

import httpx
import pytest

from src.infrastructure.weather.impl.OpenMeteoWeatherProvider import OpenMeteoWeatherProvider
from src.infrastructure.ha.HaConnectionGateway import HaStateEntry
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
                    "precipitation": 0,
                },
                "daily": {
                    "time": [
                        "2026-04-16",
                        "2026-04-17",
                        "2026-04-18",
                        "2026-04-19",
                        "2026-04-20",
                        "2026-04-21",
                    ],
                    "weather_code": [3, 61, 0, 1, 2, 80],
                    "temperature_2m_max": [24.2, 21.7, 23.0, 25.0, 26.4, 22.1],
                    "temperature_2m_min": [18.4, 17.2, 16.8, 18.0, 19.1, 17.0],
                    "precipitation_sum": [0, 4.2, 0, 0, 0, 7.8],
                }
            },
            request=httpx.Request("GET", "https://example.test/weather"),
        )


class _HaWeatherGateway:
    async def fetch_states(self, _home_id: str):
        return [
            HaStateEntry(
                payload={
                    "entity_id": "weather.forecast_home",
                    "state": "sunny",
                    "attributes": {
                        "friendly_name": "Forecast 我的家",
                        "temperature": 24.7,
                        "humidity": 8,
                    },
                }
            )
        ]

    async def call_service_response(
        self,
        _home_id: str,
        _domain: str,
        _service: str,
        _payload: dict,
    ):
        return {
            "service_response": {
                "weather.forecast_home": {
                    "forecast": [
                        {
                            "condition": "sunny",
                            "datetime": "2026-04-16T04:00:00+00:00",
                            "temperature": 25,
                            "templow": 11,
                            "precipitation": 0,
                        },
                        {
                            "condition": "rainy",
                            "datetime": "2026-04-17T04:00:00+00:00",
                            "temperature": 20,
                            "templow": 9,
                            "precipitation": 1.7,
                        },
                    ]
                }
            }
        }


@pytest.mark.asyncio
async def test_open_meteo_provider_degrades_when_weather_source_times_out(monkeypatch):
    monkeypatch.setattr(httpx, "AsyncClient", _TimeoutAsyncClient)

    settings = Settings()
    provider = OpenMeteoWeatherProvider(settings, _Clock())

    snapshot = await provider.get_sidebar_weather("home-1")

    assert snapshot is not None
    assert snapshot.cache_mode is True
    assert snapshot.fetched_at == "2026-04-16T08:00:00+00:00"
    assert snapshot.location_label == settings.weather_location_label
    assert snapshot.temperature is None
    assert snapshot.condition is None
    assert snapshot.humidity is None
    assert snapshot.precipitation is None
    assert snapshot.forecast == []


@pytest.mark.asyncio
async def test_open_meteo_provider_maps_successful_weather_response(monkeypatch):
    monkeypatch.setattr(httpx, "AsyncClient", _SuccessAsyncClient)

    settings = Settings()
    provider = OpenMeteoWeatherProvider(settings, _Clock())

    snapshot = await provider.get_sidebar_weather("home-1")

    assert snapshot is not None
    assert snapshot.cache_mode is False
    assert snapshot.location_label == settings.weather_location_label
    assert snapshot.temperature == 23
    assert snapshot.condition == "3"
    assert snapshot.humidity == 58
    assert snapshot.precipitation == 0
    assert len(snapshot.forecast) == 6
    assert snapshot.forecast[0].date == "2026-04-16"
    assert snapshot.forecast[0].temperature_max == 24
    assert snapshot.forecast[1].condition == "61"
    assert snapshot.forecast[1].precipitation == 4.2


@pytest.mark.asyncio
async def test_provider_prefers_home_assistant_weather_entity(monkeypatch):
    monkeypatch.setattr(httpx, "AsyncClient", _TimeoutAsyncClient)

    provider = OpenMeteoWeatherProvider(
        Settings(
            weather_location_label="赤峰红山区",
            weather_home_assistant_entity_id="weather.forecast_home",
        ),
        _Clock(),
        _HaWeatherGateway(),
    )

    snapshot = await provider.get_sidebar_weather("home-1")

    assert snapshot is not None
    assert snapshot.cache_mode is False
    assert snapshot.location_label == "赤峰红山区"
    assert snapshot.temperature == 24
    assert snapshot.condition == "sunny"
    assert snapshot.humidity == 8
    assert len(snapshot.forecast) == 2
    assert snapshot.forecast[0].date == "2026-04-16T04:00:00+00:00"
    assert snapshot.forecast[1].condition == "rainy"
    assert snapshot.forecast[1].precipitation == 1.7
