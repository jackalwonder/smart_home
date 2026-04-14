from __future__ import annotations

import httpx

from src.infrastructure.weather.WeatherProvider import WeatherSnapshot
from src.shared.config.Settings import Settings
from src.shared.kernel.Clock import Clock


class OpenMeteoWeatherProvider:
    def __init__(self, settings: Settings, clock: Clock) -> None:
        self._settings = settings
        self._clock = clock

    async def get_sidebar_weather(self, home_id: str) -> WeatherSnapshot | None:
        params = {
            "latitude": self._settings.weather_latitude,
            "longitude": self._settings.weather_longitude,
            "current": "temperature_2m,relative_humidity_2m,weather_code",
            "timezone": "auto",
        }
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(self._settings.weather_base_url, params=params)
            response.raise_for_status()
            payload = response.json()
        current = payload.get("current", {})
        return WeatherSnapshot(
            fetched_at=self._clock.now().isoformat(),
            cache_mode=False,
            temperature=int(current["temperature_2m"]) if current.get("temperature_2m") is not None else None,
            condition=str(current["weather_code"]) if current.get("weather_code") is not None else None,
            humidity=int(current["relative_humidity_2m"]) if current.get("relative_humidity_2m") is not None else None,
        )
