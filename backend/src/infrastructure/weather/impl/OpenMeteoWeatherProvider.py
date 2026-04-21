from __future__ import annotations

import httpx

from src.infrastructure.ha.HaConnectionGateway import HaConnectionGateway, HaStateEntry
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
    def __init__(
        self,
        settings: Settings,
        clock: Clock,
        ha_connection_gateway: HaConnectionGateway | None = None,
    ) -> None:
        self._settings = settings
        self._clock = clock
        self._ha_connection_gateway = ha_connection_gateway

    async def get_sidebar_weather(self, home_id: str) -> WeatherSnapshot | None:
        ha_snapshot = await self._get_home_assistant_weather(home_id)
        if ha_snapshot is not None:
            return ha_snapshot

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

    async def _get_home_assistant_weather(self, home_id: str) -> WeatherSnapshot | None:
        if self._ha_connection_gateway is None:
            return None
        try:
            states = await self._ha_connection_gateway.fetch_states(home_id)
        except Exception:
            return None
        if not states:
            return None

        weather_state = self._select_weather_state(states)
        if weather_state is None:
            return None

        payload = weather_state.payload
        entity_id = str(payload.get("entity_id") or "")
        attributes = payload.get("attributes")
        attributes = attributes if isinstance(attributes, dict) else {}
        forecast = await self._fetch_home_assistant_forecast(home_id, entity_id)
        precipitation = attributes.get("precipitation")
        if precipitation is None:
            precipitation = attributes.get("precipitation_sum")

        return WeatherSnapshot(
            fetched_at=self._clock.now().isoformat(),
            cache_mode=False,
            location_label=self._weather_location_label(attributes),
            temperature=_int_or_none(attributes.get("temperature")),
            condition=str(payload.get("state")) if payload.get("state") is not None else None,
            humidity=_int_or_none(attributes.get("humidity")),
            precipitation=_float_or_none(precipitation),
            forecast=forecast,
        )

    def _select_weather_state(self, states: list[HaStateEntry]) -> HaStateEntry | None:
        configured_entity_id = (self._settings.weather_home_assistant_entity_id or "").strip()
        weather_states = [
            state
            for state in states
            if str(state.payload.get("entity_id") or "").startswith("weather.")
        ]
        if configured_entity_id:
            for state in weather_states:
                if state.payload.get("entity_id") == configured_entity_id:
                    return state
            return None
        return weather_states[0] if weather_states else None

    def _weather_location_label(self, attributes: dict[str, object]) -> str | None:
        configured_label = (self._settings.weather_location_label or "").strip()
        if configured_label:
            return configured_label
        friendly_name = str(attributes.get("friendly_name") or "").strip()
        if friendly_name.startswith("Forecast "):
            friendly_name = friendly_name.removeprefix("Forecast ").strip()
        return friendly_name or None

    async def _fetch_home_assistant_forecast(
        self,
        home_id: str,
        entity_id: str,
    ) -> list[WeatherForecastPoint]:
        if not entity_id or self._ha_connection_gateway is None:
            return []
        try:
            response = await self._ha_connection_gateway.call_service_response(
                home_id,
                "weather",
                "get_forecasts",
                {"entity_id": entity_id, "type": "daily"},
            )
        except Exception:
            return []
        if not isinstance(response, dict):
            return []
        service_response = response.get("service_response")
        if not isinstance(service_response, dict):
            return []
        entity_response = service_response.get(entity_id)
        if not isinstance(entity_response, dict):
            return []
        forecast_payload = entity_response.get("forecast")
        if not isinstance(forecast_payload, list):
            return []

        forecast: list[WeatherForecastPoint] = []
        for index, point in enumerate(forecast_payload[:6]):
            if not isinstance(point, dict):
                continue
            forecast.append(
                WeatherForecastPoint(
                    date=str(point.get("datetime") or point.get("date") or f"forecast-{index}"),
                    condition=str(point.get("condition"))
                    if point.get("condition") is not None
                    else None,
                    temperature_max=_int_or_none(point.get("temperature")),
                    temperature_min=_int_or_none(point.get("templow")),
                    precipitation=_float_or_none(point.get("precipitation")),
                )
            )
        return forecast
