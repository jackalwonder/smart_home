from __future__ import annotations

from src.infrastructure.weather.WeatherProvider import WeatherSnapshot
from src.shared.kernel.Clock import Clock


class StaticWeatherProvider:
    def __init__(self, clock: Clock) -> None:
        self._clock = clock

    async def get_sidebar_weather(self, home_id: str) -> WeatherSnapshot:
        return WeatherSnapshot(
            fetched_at=self._clock.now().isoformat(),
            cache_mode=True,
            temperature=None,
            condition=None,
            humidity=None,
        )
