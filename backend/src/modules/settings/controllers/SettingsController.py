from __future__ import annotations

from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, Body, Depends, Query, Request
from pydantic import Field

from src.app.container import (
    get_favorites_query_service,
    get_request_context_service,
    get_settings_query_service,
    get_settings_save_service,
)
from src.modules.auth.services.query.RequestContextService import RequestContextService
from src.modules.settings.services.command.SettingsSaveService import (
    SettingsSaveInput,
    SettingsSaveService,
)
from src.modules.settings.services.query.FavoritesQueryService import (
    FavoritesQueryInput,
    FavoritesQueryService,
)
from src.modules.settings.services.query.SettingsQueryService import (
    SettingsQueryInput,
    SettingsQueryService,
)
from src.shared.http.ApiSchema import ApiSchema
from src.shared.http.ResponseEnvelope import SuccessEnvelope, success_response

router = APIRouter(tags=["settings"])


class SettingsSaveRequestBody(ApiSchema):
    home_id: str | None = Field(
        default=None,
        description="Legacy compatibility context field.",
        json_schema_extra={"deprecated": True},
    )
    settings_version: str | None = None
    page_settings: dict[str, Any] = Field(default_factory=dict)
    function_settings: dict[str, Any] = Field(default_factory=dict)
    favorites: list[dict[str, Any]] = Field(default_factory=list)
    terminal_id: str | None = Field(
        default=None,
        description="Legacy compatibility context field.",
        json_schema_extra={"deprecated": True},
    )
    member_id: str | None = None


class SettingsSaveResponse(ApiSchema):
    saved: bool
    settings_version: str
    updated_domains: list[str]
    effective_at: str


class SettingsPageSettingsResponse(ApiSchema):
    settings_version: str | None = None
    room_label_mode: str
    homepage_display_policy: dict[str, Any] = Field(default_factory=dict)
    icon_policy: dict[str, Any] = Field(default_factory=dict)
    layout_preference: dict[str, Any] = Field(default_factory=dict)


class SettingsFunctionSettingsResponse(ApiSchema):
    settings_version: str | None = None
    low_battery_threshold: float | int
    offline_threshold_seconds: int
    quick_entry_policy: dict[str, Any] = Field(default_factory=dict)
    music_enabled: bool
    favorite_limit: int
    auto_home_timeout_seconds: int | None = None
    position_device_thresholds: dict[str, Any] = Field(default_factory=dict)


class SettingsFavoriteItemResponse(ApiSchema):
    device_id: str
    selected: bool
    favorite_order: int | None = None


class SettingsSystemSummaryResponse(ApiSchema):
    system_connections_configured: bool
    energy_binding_status: str
    default_media_binding_status: str


class SettingsSnapshotResponse(ApiSchema):
    settings_version: str | None = None
    page_settings: SettingsPageSettingsResponse | None = None
    function_settings: SettingsFunctionSettingsResponse | None = None
    favorites: list[SettingsFavoriteItemResponse] = Field(default_factory=list)
    system_settings_summary: SettingsSystemSummaryResponse
    pin_session_required: bool


class FavoritesCatalogItemResponse(ApiSchema):
    device_id: str
    display_name: str
    device_type: str
    room_id: str | None = None
    room_name: str | None = None
    selected: bool
    favorite_order: int | None = None
    is_selectable: bool
    exclude_reason: str | None = None


class FavoritesResponse(ApiSchema):
    items: list[FavoritesCatalogItemResponse] = Field(default_factory=list)
    selected_count: int
    max_recommended: int
    max_allowed: int
    settings_version: str | None = None


@router.get("/api/v1/settings", response_model=SuccessEnvelope[SettingsSnapshotResponse])
async def get_settings(
    request: Request,
    service: SettingsQueryService = Depends(get_settings_query_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(request, require_home=True)
    view = await service.get_settings(SettingsQueryInput(home_id=context.home_id))
    return success_response(request, SettingsSnapshotResponse.model_validate(asdict(view)))


@router.get("/api/v1/function-settings", response_model=SuccessEnvelope[SettingsFunctionSettingsResponse])
async def get_function_settings(
    request: Request,
    service: SettingsQueryService = Depends(get_settings_query_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(request, require_home=True)
    payload = await service.get_function_settings(SettingsQueryInput(home_id=context.home_id))
    return success_response(request, SettingsFunctionSettingsResponse.model_validate(payload))


@router.get("/api/v1/page-settings", response_model=SuccessEnvelope[SettingsPageSettingsResponse])
async def get_page_settings(
    request: Request,
    service: SettingsQueryService = Depends(get_settings_query_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(request, require_home=True)
    payload = await service.get_page_settings(SettingsQueryInput(home_id=context.home_id))
    return success_response(request, SettingsPageSettingsResponse.model_validate(payload))


@router.get("/api/v1/favorites", response_model=SuccessEnvelope[FavoritesResponse])
async def get_favorites(
    request: Request,
    service: FavoritesQueryService = Depends(get_favorites_query_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(request, require_home=True)
    payload = await service.get_favorites(FavoritesQueryInput(home_id=context.home_id))
    return success_response(request, FavoritesResponse.model_validate(payload))


@router.put("/api/v1/settings", response_model=SuccessEnvelope[SettingsSaveResponse])
async def save_settings(
    request: Request,
    body: SettingsSaveRequestBody = Body(...),
    service: SettingsSaveService = Depends(get_settings_save_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(
        request,
        explicit_home_id=body.home_id,
        explicit_terminal_id=body.terminal_id,
        require_home=True,
        require_terminal=True,
    )
    view = await service.save(
        SettingsSaveInput(
            home_id=context.home_id,
            settings_version=body.settings_version,
            page_settings=body.page_settings,
            function_settings=body.function_settings,
            favorites=body.favorites,
            terminal_id=context.terminal_id,
            member_id=body.member_id or context.operator_id,
        )
    )
    return success_response(request, SettingsSaveResponse.model_validate(asdict(view)))
