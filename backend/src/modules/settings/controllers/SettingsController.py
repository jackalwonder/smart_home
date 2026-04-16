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
    home_id: str | None = Field(default=None, description="Legacy compatibility context field.")
    settings_version: str | None = None
    page_settings: dict[str, Any] = Field(default_factory=dict)
    function_settings: dict[str, Any] = Field(default_factory=dict)
    favorites: list[dict[str, Any]] = Field(default_factory=list)
    terminal_id: str | None = Field(default=None, description="Legacy compatibility context field.")
    member_id: str | None = None


class SettingsSaveResponse(ApiSchema):
    saved: bool
    settings_version: str
    updated_domains: list[str]
    effective_at: str


@router.get("/api/v1/settings", response_model=SuccessEnvelope[dict[str, Any]])
async def get_settings(
    request: Request,
    service: SettingsQueryService = Depends(get_settings_query_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(request, require_home=True)
    view = await service.get_settings(SettingsQueryInput(home_id=context.home_id))
    return success_response(request, asdict(view))


@router.get("/api/v1/function-settings", response_model=SuccessEnvelope[dict[str, Any]])
async def get_function_settings(
    request: Request,
    service: SettingsQueryService = Depends(get_settings_query_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(request, require_home=True)
    return success_response(
        request,
        await service.get_function_settings(SettingsQueryInput(home_id=context.home_id)),
    )


@router.get("/api/v1/page-settings", response_model=SuccessEnvelope[dict[str, Any]])
async def get_page_settings(
    request: Request,
    service: SettingsQueryService = Depends(get_settings_query_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(request, require_home=True)
    return success_response(
        request,
        await service.get_page_settings(SettingsQueryInput(home_id=context.home_id)),
    )


@router.get("/api/v1/favorites", response_model=SuccessEnvelope[list[dict[str, Any]]])
async def get_favorites(
    request: Request,
    service: FavoritesQueryService = Depends(get_favorites_query_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(request, require_home=True)
    return success_response(
        request,
        await service.get_favorites(FavoritesQueryInput(home_id=context.home_id)),
    )


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
