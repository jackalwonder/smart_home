from __future__ import annotations

from fastapi import APIRouter, Body, Depends, Query, Request
from pydantic import BaseModel

from src.app.container import get_device_catalog_service, get_request_context_service
from src.modules.auth.services.query.RequestContextService import RequestContextService
from src.modules.home_overview.services.DeviceCatalogService import DeviceCatalogService
from src.shared.http.ResponseEnvelope import success_response

router = APIRouter(tags=["devices"])


class DeviceMappingBody(BaseModel):
    room_id: str | None = None
    device_type: str | None = None
    is_primary_device: bool | None = None
    default_control_target: str | None = None


@router.get("/api/v1/devices")
async def list_devices(
    request: Request,
    room_id: str | None = Query(default=None),
    device_type: str | None = Query(default=None),
    status: str | None = Query(default=None),
    keyword: str | None = Query(default=None),
    only_homepage_candidate: bool = Query(default=False),
    only_favorite_candidate: bool = Query(default=False),
    page: int = Query(default=1),
    page_size: int = Query(default=20),
    service: DeviceCatalogService = Depends(get_device_catalog_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(
        request,
        require_home=True,
    )
    return success_response(
        request,
        await service.list_devices(
            context.home_id,
            room_id=room_id,
            device_type=device_type,
            status=status,
            keyword=keyword,
            only_homepage_candidate=only_homepage_candidate,
            only_favorite_candidate=only_favorite_candidate,
            page=page,
            page_size=page_size,
        ),
    )


@router.get("/api/v1/devices/{device_id}")
async def get_device_detail(
    request: Request,
    device_id: str,
    include_runtime_fields: bool = Query(default=True),
    include_editor_fields: bool = Query(default=False),
    service: DeviceCatalogService = Depends(get_device_catalog_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(
        request,
        require_home=True,
    )
    return success_response(
        request,
        await service.get_device_detail(
            context.home_id,
            device_id,
            include_runtime_fields=include_runtime_fields,
            include_editor_fields=include_editor_fields,
        ),
    )


@router.get("/api/v1/rooms")
async def list_rooms(
    request: Request,
    include_counts: bool = Query(default=True),
    service: DeviceCatalogService = Depends(get_device_catalog_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(
        request,
        require_home=True,
    )
    return success_response(
        request,
        {
            "rooms": await service.list_rooms(context.home_id, include_counts=include_counts),
        },
    )


@router.put("/api/v1/device-mappings/{device_id}")
async def update_device_mapping(
    request: Request,
    device_id: str,
    body: DeviceMappingBody = Body(...),
    service: DeviceCatalogService = Depends(get_device_catalog_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(
        request,
        require_home=True,
        require_terminal=True,
    )
    return success_response(
        request,
        await service.update_mapping(
            home_id=context.home_id,
            terminal_id=context.terminal_id,
            device_id=device_id,
            room_id=body.room_id,
            device_type=body.device_type,
            is_primary_device=body.is_primary_device,
            default_control_target=body.default_control_target,
            provided_fields=body.model_fields_set,
        ),
    )
