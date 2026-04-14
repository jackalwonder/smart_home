from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class WeatherSnapshot:
    fetched_at: str
    cache_mode: bool
    temperature: int | None = None
    condition: str | None = None
    humidity: int | None = None


class WeatherProvider(Protocol):
    async def get_sidebar_weather(self, home_id: str) -> WeatherSnapshot | None: ...
