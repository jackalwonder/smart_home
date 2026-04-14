from __future__ import annotations

from dataclasses import dataclass

from src.infrastructure.weather.WeatherProvider import WeatherProvider, WeatherSnapshot
from src.repositories.query.overview.HomeOverviewQueryRepository import (
    HomeOverviewQueryRepository,
)
from src.repositories.query.overview.types import HomeOverviewReadModel


@dataclass(frozen=True)
class HomeOverviewQueryInput:
    home_id: str


@dataclass(frozen=True)
class HomeOverviewView:
    overview: HomeOverviewReadModel
    weather: WeatherSnapshot | None


class HomeOverviewQueryService:
    def __init__(
        self,
        home_overview_query_repository: HomeOverviewQueryRepository,
        weather_provider: WeatherProvider,
    ) -> None:
        self._home_overview_query_repository = home_overview_query_repository
        self._weather_provider = weather_provider

    async def get_overview(self, input: HomeOverviewQueryInput) -> HomeOverviewView:
        overview = await self._home_overview_query_repository.get_overview_context(input.home_id)
        weather = await self._weather_provider.get_sidebar_weather(input.home_id)
        return HomeOverviewView(overview=overview, weather=weather)
