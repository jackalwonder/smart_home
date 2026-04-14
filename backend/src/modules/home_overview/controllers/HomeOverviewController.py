from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query, Request

from src.app.container import get_device_catalog_service, get_home_overview_query_service
from src.modules.home_overview.services.DeviceCatalogService import DeviceCatalogService
from src.modules.home_overview.services.query.HomeOverviewQueryService import (
    HomeOverviewQueryInput,
    HomeOverviewQueryService,
)
from src.shared.http.ResponseEnvelope import success_response

router = APIRouter(prefix="/api/v1/home", tags=["home_overview"])


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _build_summary(devices: list[dict[str, Any]]) -> dict[str, Any]:
    online_count = sum(1 for device in devices if not device["is_offline"])
    offline_count = len(devices) - online_count
    lights_on_count = sum(
        1
        for device in devices
        if device["device_type"] in {"light", "switch"} and str(device["status"]).upper() in {"ON", "OPEN"}
    )
    running_device_count = sum(
        1
        for device in devices
        if str(device["status"]).upper() not in {"OFF", "IDLE", "UNKNOWN", "UNAVAILABLE"}
    )
    low_battery_count = sum(
        1 for device in devices if any(badge["code"] == "LOW_BATTERY" for badge in device["alert_badges"])
    )
    position_summary = {"opened_count": 0, "closed_count": 0, "partial_count": 0}
    for device in devices:
        state = str(device["status_summary"].get("state") or device["status"]).upper()
        if device["device_type"] in {"cover", "curtain", "blind"}:
            if state in {"OPEN", "OPENED"}:
                position_summary["opened_count"] += 1
            elif state in {"CLOSED", "CLOSE", "OFF"}:
                position_summary["closed_count"] += 1
            else:
                position_summary["partial_count"] += 1
    return {
        "online_count": online_count,
        "offline_count": offline_count,
        "lights_on_count": lights_on_count,
        "running_device_count": running_device_count,
        "position_device_summary": position_summary,
        "low_battery_count": low_battery_count,
    }


@router.get("/overview")
async def get_home_overview(
    request: Request,
    home_id: str = Query(...),
    layout_version: str | None = Query(default=None),
    settings_version: str | None = Query(default=None),
    terminal_mode: str | None = Query(default=None),
    service: HomeOverviewQueryService = Depends(get_home_overview_query_service),
) -> object:
    view = await service.get_overview(HomeOverviewQueryInput(home_id=home_id))
    overview = view.overview
    devices = [asdict(device) for device in overview.devices]
    weather = asdict(view.weather) if view.weather is not None else None
    return success_response(
        request,
        {
            "home_info": {"home_id": overview.layout.home_id},
            "layout_version": layout_version or overview.layout.layout_version,
            "settings_version": settings_version or overview.settings_version,
            "stage": {
                "background_image_url": overview.layout.background_image_url,
                "background_image_size": {
                    "width": overview.layout.background_image_width,
                    "height": overview.layout.background_image_height,
                },
                "hotspots": overview.hotspots,
            },
            "sidebar": {
                "datetime": {
                    "current_time": _utc_now(),
                    "terminal_mode": terminal_mode,
                },
                "weather": weather,
                "music_card": asdict(overview.media),
                "summary": _build_summary(devices),
            },
            "quick_entries": overview.function_settings.quick_entry_policy or {},
            "energy_bar": asdict(overview.energy) if overview.energy is not None else None,
            "system_state": {
                "home_assistant": asdict(overview.system_connection)
                if overview.system_connection is not None
                else None,
                "default_media": {
                    "binding_status": overview.media.binding_status,
                    "availability_status": overview.media.availability_status,
                },
            },
            "cache_mode": bool(view.weather.cache_mode) if view.weather is not None else False,
            "ui_policy": {
                "room_label_mode": overview.page_settings.room_label_mode,
                "homepage_display_policy": overview.page_settings.homepage_display_policy,
                "icon_policy": overview.page_settings.icon_policy or {},
                "layout_preference": overview.page_settings.layout_preference or {},
                "favorite_limit": overview.function_settings.favorite_limit,
                "auto_home_timeout_seconds": overview.function_settings.auto_home_timeout_seconds,
                "position_device_thresholds": overview.function_settings.position_device_thresholds or {},
            },
        },
    )


@router.get("/panels/{panel_type}")
async def get_home_panel(
    request: Request,
    panel_type: str,
    home_id: str = Query(...),
    room_id: str | None = Query(default=None),
    page: int | None = Query(default=None),
    page_size: int | None = Query(default=None),
    service: DeviceCatalogService = Depends(get_device_catalog_service),
) -> object:
    return success_response(
        request,
        await service.get_panel(
            home_id,
            panel_type,
            room_id=room_id,
            page=page,
            page_size=page_size,
        ),
    )
