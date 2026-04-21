from __future__ import annotations

import httpx

from src.infrastructure.weather.WeatherProvider import WeatherForecastPoint, WeatherSnapshot
from src.shared.config.Settings import Settings
from src.shared.kernel.Clock import Clock


def _int_or_none(value: object) -> int | None:
    if value is None:
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _float_or_none(value: object) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


class OpenMeteoWeatherProvider:
    def __init__(self, settings: Settings, clock: Clock) -> None:
        self._settings = settings
        self._clock = clock

    async def get_sidebar_weather(self, home_id: str) -> WeatherSnapshot | None:
        params = {
            "latitude": self._settings.weather_latitude,
            "longitude": self._settings.weather_longitude,
            "current": "temperature_2m,relative_humidity_2m,weather_code,precipitation",
            "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum",
            "forecast_days": 6,
            "timezone": "auto",
        }
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(self._settings.weather_base_url, params=params)
                response.raise_for_status()
                payload = response.json()
            current = payload.get("current", {})
            daily = payload.get("daily", {})
        except (httpx.HTTPError, KeyError, TypeError, ValueError):
            return WeatherSnapshot(
                fetched_at=self._clock.now().isoformat(),
                cache_mode=True,
                location_label=self._settings.weather_location_label,
                temperature=None,
                condition=None,
                humidity=None,
                precipitation=None,
                forecast=[],
            )

        forecast: list[WeatherForecastPoint] = []
        dates = daily.get("time") if isinstance(daily, dict) else None
        if isinstance(dates, list):
            codes = daily.get("weather_code", [])
            highs = daily.get("temperature_2m_max", [])
            lows = daily.get("temperature_2m_min", [])
            precipitation = daily.get("precipitation_sum", [])
            for index, date in enumerate(dates[:6]):
                forecast.append(
                    WeatherForecastPoint(
                        date=str(date),
                        condition=str(codes[index])
                        if index < len(codes) and codes[index] is not None
                        else None,
                        temperature_max=_int_or_none(highs[index])
                        if index < len(highs)
                        else None,
                        temperature_min=_int_or_none(lows[index])
                        if index < len(lows)
                        else None,
                        precipitation=_float_or_none(precipitation[index])
                        if index < len(precipitation)
                        else None,
                    )
                )

        return WeatherSnapshot(
            fetched_at=self._clock.now().isoformat(),
            cache_mode=False,
            location_label=self._settings.weather_location_label,
            temperature=_int_or_none(current.get("temperature_2m")),
            condition=str(current["weather_code"]) if current.get("weather_code") is not None else None,
            humidity=_int_or_none(current.get("relative_humidity_2m")),
            precipitation=_float_or_none(current.get("precipitation")),
            forecast=forecast,
        )
