from __future__ import annotations

from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, Body, Depends, Query, Request
from pydantic import BaseModel, Field

from src.app.container import (
    get_favorites_query_service,
    get_settings_query_service,
    get_settings_save_service,
)
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
from src.shared.http.ResponseEnvelope import success_response

router = APIRouter(tags=["settings"])


class SettingsSaveRequestBody(BaseModel):
    home_id: str = Field(...)
    settings_version: str | None = None
    page_settings: dict[str, Any] = Field(default_factory=dict)
    function_settings: dict[str, Any] = Field(default_factory=dict)
    favorites: list[dict[str, Any]] = Field(default_factory=list)
    terminal_id: str | None = None
    member_id: str | None = None


class SettingsSaveResponse(BaseModel):
    saved: bool
    settings_version: str
    updated_domains: list[str]
    effective_at: str


@router.get("/api/v1/settings")
async def get_settings(
    request: Request,
    home_id: str = Query(...),
    service: SettingsQueryService = Depends(get_settings_query_service),
) -> object:
    view = await service.get_settings(SettingsQueryInput(home_id=home_id))
    return success_response(request, asdict(view))


@router.get("/api/v1/function-settings")
async def get_function_settings(
    request: Request,
    home_id: str = Query(...),
    service: SettingsQueryService = Depends(get_settings_query_service),
) -> object:
    return success_response(
        request,
        await service.get_function_settings(SettingsQueryInput(home_id=home_id)),
    )


@router.get("/api/v1/page-settings")
async def get_page_settings(
    request: Request,
    home_id: str = Query(...),
    service: SettingsQueryService = Depends(get_settings_query_service),
) -> object:
    return success_response(
        request,
        await service.get_page_settings(SettingsQueryInput(home_id=home_id)),
    )


@router.get("/api/v1/favorites")
async def get_favorites(
    request: Request,
    home_id: str = Query(...),
    service: FavoritesQueryService = Depends(get_favorites_query_service),
) -> object:
    return success_response(
        request,
        await service.get_favorites(FavoritesQueryInput(home_id=home_id)),
    )


@router.put("/api/v1/settings")
async def save_settings(
    request: Request,
    body: SettingsSaveRequestBody = Body(...),
    service: SettingsSaveService = Depends(get_settings_save_service),
) -> object:
    view = await service.save(
        SettingsSaveInput(
            home_id=body.home_id,
            settings_version=body.settings_version,
            page_settings=body.page_settings,
            function_settings=body.function_settings,
            favorites=body.favorites,
            terminal_id=body.terminal_id,
            member_id=body.member_id,
        )
    )
    return success_response(request, SettingsSaveResponse.model_validate(asdict(view)))
