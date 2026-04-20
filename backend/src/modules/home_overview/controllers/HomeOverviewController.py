from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from pydantic import Field

from src.app.container import (
    get_device_catalog_service,
    get_home_overview_query_service,
    get_request_context_service,
)
from src.modules.auth.services.query.RequestContextService import RequestContextService
from src.modules.home_overview.services.DeviceCatalogService import DeviceCatalogService
from src.modules.home_overview.services.query.HomeOverviewQueryService import (
    HomeOverviewQueryInput,
    HomeOverviewQueryService,
)
from src.shared.http.ApiSchema import ApiSchema
from src.shared.http.ResponseEnvelope import SuccessEnvelope, success_response

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


class HomeOverviewImageSizeResponse(ApiSchema):
    width: int | None = None
    height: int | None = None


class HomeOverviewHotspotResponse(ApiSchema):
    hotspot_id: str
    device_id: str
    display_name: str
    device_type: str
    x: float
    y: float
    icon_type: str | None = None
    label_mode: str | None = None
    status: str
    is_offline: bool
    is_complex_device: bool
    is_readonly_device: bool
    entry_behavior: str
    alert_badges: list[dict[str, Any]] = Field(default_factory=list)
    status_summary: dict[str, Any] = Field(default_factory=dict)
    default_control_target: str | None = None
    display_policy: str | None = None


class HomeOverviewStageResponse(ApiSchema):
    background_image_url: str | None = None
    background_image_size: HomeOverviewImageSizeResponse | None = None
    hotspots: list[HomeOverviewHotspotResponse] = Field(default_factory=list)


class HomeOverviewDateTimeResponse(ApiSchema):
    current_time: str
    terminal_mode: str | None = None


class HomeOverviewWeatherResponse(ApiSchema):
    fetched_at: str
    cache_mode: bool
    temperature: float | int | str | None = None
    condition: str | None = None
    humidity: float | int | str | None = None


class HomeOverviewMusicCardResponse(ApiSchema):
    binding_status: str
    availability_status: str | None = None
    device_id: str | None = None
    display_name: str | None = None
    play_state: str | None = None
    track_title: str | None = None
    artist: str | None = None
    entry_behavior: str | None = None


class HomeOverviewPositionDeviceSummaryResponse(ApiSchema):
    opened_count: int
    closed_count: int
    partial_count: int


class HomeOverviewSummaryResponse(ApiSchema):
    online_count: int
    offline_count: int
    lights_on_count: int
    running_device_count: int
    position_device_summary: HomeOverviewPositionDeviceSummaryResponse
    low_battery_count: int


class HomeOverviewSidebarResponse(ApiSchema):
    datetime: HomeOverviewDateTimeResponse
    weather: HomeOverviewWeatherResponse | None = None
    music_card: HomeOverviewMusicCardResponse
    summary: HomeOverviewSummaryResponse


class HomeOverviewEnergyBarResponse(ApiSchema):
    binding_status: str
    refresh_status: str
    yesterday_usage: float | int | None = None
    monthly_usage: float | int | None = None
    yearly_usage: float | int | None = None
    balance: float | int | None = None
    updated_at: str | None = None


class HomeOverviewSystemConnectionResponse(ApiSchema):
    system_type: str
    connection_status: str
    auth_configured: bool
    last_test_at: str | None = None
    last_sync_at: str | None = None


class HomeOverviewDefaultMediaStateResponse(ApiSchema):
    binding_status: str
    availability_status: str | None = None


class HomeOverviewSystemStateResponse(ApiSchema):
    home_assistant: HomeOverviewSystemConnectionResponse | None = None
    default_media: HomeOverviewDefaultMediaStateResponse


class HomeOverviewUiPolicyResponse(ApiSchema):
    room_label_mode: str
    homepage_display_policy: dict[str, Any] = Field(default_factory=dict)
    icon_policy: dict[str, Any] = Field(default_factory=dict)
    layout_preference: dict[str, Any] = Field(default_factory=dict)
    favorite_limit: int
    auto_home_timeout_seconds: int | None = None
    position_device_thresholds: dict[str, Any] = Field(default_factory=dict)


class HomeOverviewHomeInfoResponse(ApiSchema):
    home_id: str


class HomeOverviewQuickEntryResponse(ApiSchema):
    key: str
    title: str
    badge_count: int | str | None = None


class HomeOverviewFavoriteDeviceResponse(ApiSchema):
    device_id: str
    display_name: str
    device_type: str
    room_id: str | None = None
    room_name: str | None = None
    status: str
    is_offline: bool
    is_complex_device: bool
    is_readonly_device: bool
    entry_behavior: str
    alert_badges: list[dict[str, Any]] = Field(default_factory=list)
    status_summary: dict[str, Any] = Field(default_factory=dict)
    favorite_order: int | None = None


class HomeOverviewResponse(ApiSchema):
    home_info: HomeOverviewHomeInfoResponse
    layout_version: str
    settings_version: str | None = None
    stage: HomeOverviewStageResponse
    sidebar: HomeOverviewSidebarResponse
    quick_entries: dict[str, Any] | list[HomeOverviewQuickEntryResponse]
    favorite_devices: list[HomeOverviewFavoriteDeviceResponse] = Field(default_factory=list)
    energy_bar: HomeOverviewEnergyBarResponse | None = None
    system_state: HomeOverviewSystemStateResponse
    cache_mode: bool
    ui_policy: HomeOverviewUiPolicyResponse


class HomePanelAlertBadgeResponse(ApiSchema):
    code: str
    level: str
    text: str


class HomePanelItemResponse(ApiSchema):
    device_id: str
    display_name: str
    device_type: str
    room_id: str | None = None
    room_name: str | None = None
    status: str
    is_offline: bool
    is_complex_device: bool
    is_readonly_device: bool
    entry_behavior: str | None = None
    confirmation_type: str | None = None
    alert_badges: list[HomePanelAlertBadgeResponse] = Field(default_factory=list)
    favorite_order: int | None = None
    is_selectable: bool
    exclude_reason: str | None = None


class HomePanelSummaryResponse(ApiSchema):
    count: int


class HomePanelResponse(ApiSchema):
    panel_type: str
    title: str
    items: list[HomePanelItemResponse] = Field(default_factory=list)
    summary: HomePanelSummaryResponse
    cache_mode: bool


@router.get("/overview", response_model=SuccessEnvelope[HomeOverviewResponse])
async def get_home_overview(
    request: Request,
    layout_version: str | None = Query(default=None),
    settings_version: str | None = Query(default=None),
    terminal_mode: str | None = Query(default=None),
    service: HomeOverviewQueryService = Depends(get_home_overview_query_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(
        request,
        require_home=True,
    )
    view = await service.get_overview(HomeOverviewQueryInput(home_id=context.home_id))
    overview = view.overview
    devices = [asdict(device) for device in overview.devices]
    favorite_devices = [
        {
            "device_id": device.device_id,
            "display_name": device.display_name,
            "device_type": device.device_type,
            "room_id": device.room_id,
            "room_name": device.room_name,
            "status": device.status,
            "is_offline": device.is_offline,
            "is_complex_device": device.is_complex_device,
            "is_readonly_device": device.is_readonly_device,
            "entry_behavior": device.entry_behavior,
            "alert_badges": device.alert_badges,
            "status_summary": device.status_summary,
            "favorite_order": device.favorite_order,
        }
        for device in overview.favorite_devices
    ]
    weather = asdict(view.weather) if view.weather is not None else None
    payload = {
        "home_info": {"home_id": overview.layout.home_id},
        "layout_version": layout_version or overview.layout.layout_version,
        "settings_version": settings_version or overview.settings_version,
        "stage": {
            "background_image_url": (
                f"/api/v1/page-assets/floorplan/{overview.layout.background_asset_id}/file"
                if overview.layout.background_asset_id is not None
                and overview.layout.background_image_url is not None
                else None
            ),
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
        "favorite_devices": favorite_devices,
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
    }
    return success_response(request, HomeOverviewResponse.model_validate(payload))


@router.get("/panels/{panel_type}", response_model=SuccessEnvelope[HomePanelResponse])
async def get_home_panel(
    request: Request,
    panel_type: str,
    room_id: str | None = Query(default=None),
    page: int | None = Query(default=None),
    page_size: int | None = Query(default=None),
    service: DeviceCatalogService = Depends(get_device_catalog_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(
        request,
        require_home=True,
    )
    payload = await service.get_panel(
        context.home_id,
        panel_type,
        room_id=room_id,
        page=page,
        page_size=page_size,
    )
    return success_response(request, HomePanelResponse.model_validate(payload))
