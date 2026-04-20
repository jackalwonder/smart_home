from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from src.repositories.read_models.index import (
    CurrentLayoutVersion,
    DefaultMediaReadModel,
    DeviceCardReadModel,
    FavoriteDeviceCardReadModel,
    FavoriteDeviceReadModel,
    FunctionSettingsReadModel,
    PageSettingsReadModel,
)


@dataclass(frozen=True)
class EnergySummaryReadModel:
    binding_status: str
    refresh_status: str
    yesterday_usage: float | None
    monthly_usage: float | None
    yearly_usage: float | None
    balance: float | None
    updated_at: str | None


@dataclass(frozen=True)
class SystemConnectionSummaryReadModel:
    system_type: str
    connection_status: str
    auth_configured: bool
    last_test_at: str | None
    last_sync_at: str | None


@dataclass(frozen=True)
class HomeOverviewReadModel:
    layout: CurrentLayoutVersion
    settings_version: str | None
    hotspots: list[dict[str, Any]]
    devices: list[DeviceCardReadModel]
    favorites: list[FavoriteDeviceReadModel]
    favorite_devices: list[FavoriteDeviceCardReadModel]
    page_settings: PageSettingsReadModel
    function_settings: FunctionSettingsReadModel
    energy: EnergySummaryReadModel | None
    media: DefaultMediaReadModel
    system_connection: SystemConnectionSummaryReadModel | None
