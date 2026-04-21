from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass(frozen=True)
class WeatherForecastPoint:
    date: str
    condition: str | None = None
    temperature_max: int | None = None
    temperature_min: int | None = None
    precipitation: float | None = None


@dataclass(frozen=True)
class WeatherSnapshot:
    fetched_at: str
    cache_mode: bool
    location_label: str | None = None
    temperature: int | None = None
    condition: str | None = None
    humidity: int | None = None
    precipitation: float | None = None
    forecast: list[WeatherForecastPoint] = field(default_factory=list)


class WeatherProvider(Protocol):
    async def get_sidebar_weather(self, home_id: str) -> WeatherSnapshot | None: ...
