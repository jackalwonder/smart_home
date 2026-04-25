from __future__ import annotations

import pytest

from src.modules.settings.services.query.FavoritesQueryService import (
    FavoritesQueryInput,
    FavoritesQueryService,
)
from src.repositories.query.settings.FavoritesQueryRepository import (
    FavoriteDeviceRow,
    FavoriteFunctionSettingsRow,
    FavoriteSelectionRow,
    FavoriteSettingsRow,
    FavoritesQuerySnapshot,
)


class _FavoritesQueryRepository:
    def __init__(self, snapshot: FavoritesQuerySnapshot) -> None:
        self.snapshot = snapshot
        self.home_ids = []

    async def get_snapshot(self, home_id: str) -> FavoritesQuerySnapshot:
        self.home_ids.append(home_id)
        return self.snapshot


@pytest.mark.asyncio
async def test_favorites_query_service_builds_selection_view_from_repository_snapshot():
    repository = _FavoritesQueryRepository(
        FavoritesQuerySnapshot(
            settings=FavoriteSettingsRow(id="settings-1", settings_version="sv_1"),
            function_settings=FavoriteFunctionSettingsRow(favorite_limit=2),
            favorites=[
                FavoriteSelectionRow(device_id="device-2", selected=True, favorite_order=1),
                FavoriteSelectionRow(device_id="device-1", selected=False, favorite_order=2),
            ],
            media_device_id="device-3",
            devices=[
                FavoriteDeviceRow(
                    device_id="device-1",
                    display_name="Lamp",
                    device_type="light",
                    room_id="room-1",
                    room_name="Living",
                    is_readonly_device=False,
                ),
                FavoriteDeviceRow(
                    device_id="device-2",
                    display_name="Air",
                    device_type="climate",
                    room_id=None,
                    room_name=None,
                    is_readonly_device=False,
                ),
                FavoriteDeviceRow(
                    device_id="device-3",
                    display_name="Speaker",
                    device_type="media_player",
                    room_id=None,
                    room_name=None,
                    is_readonly_device=False,
                ),
                FavoriteDeviceRow(
                    device_id="device-4",
                    display_name="Sensor",
                    device_type="sensor",
                    room_id=None,
                    room_name=None,
                    is_readonly_device=True,
                ),
            ],
        )
    )
    service = FavoritesQueryService(repository)

    result = await service.get_favorites(FavoritesQueryInput(home_id="home-1"))

    assert repository.home_ids == ["home-1"]
    assert result["settings_version"] == "sv_1"
    assert result["selected_count"] == 1
    assert result["max_allowed"] == 2
    assert [item["device_id"] for item in result["items"]] == [
        "device-2",
        "device-1",
        "device-4",
        "device-3",
    ]
    assert result["items"][2]["exclude_reason"] == "READONLY_DEVICE"
    assert result["items"][3]["exclude_reason"] == "DEFAULT_MEDIA_DEVICE"


@pytest.mark.asyncio
async def test_favorites_query_service_defaults_when_settings_missing():
    repository = _FavoritesQueryRepository(FavoritesQuerySnapshot(settings=None))
    service = FavoritesQueryService(repository)

    result = await service.get_favorites(FavoritesQueryInput(home_id="home-1"))

    assert result["settings_version"] is None
    assert result["max_allowed"] == 8
    assert result["items"] == []
