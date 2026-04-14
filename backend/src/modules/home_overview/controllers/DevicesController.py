from __future__ import annotations

from fastapi import APIRouter, Body, Depends, Query, Request
from pydantic import BaseModel

from src.app.container import get_device_catalog_service
from src.modules.home_overview.services.DeviceCatalogService import DeviceCatalogService
from src.shared.http.ResponseEnvelope import success_response

router = APIRouter(tags=["devices"])


class DeviceMappingBody(BaseModel):
    home_id: str
    terminal_id: str
    room_name: str | None = None
    device_type: str | None = None
    is_primary_device: bool | None = None


@router.get("/api/v1/devices")
async def list_devices(
    request: Request,
    home_id: str = Query(...),
    room_id: str | None = Query(default=None),
    device_type: str | None = Query(default=None),
    status: str | None = Query(default=None),
    keyword: str | None = Query(default=None),
    only_homepage_candidate: bool = Query(default=False),
    only_favorite_candidate: bool = Query(default=False),
    page: int = Query(default=1),
    page_size: int = Query(default=20),
    service: DeviceCatalogService = Depends(get_device_catalog_service),
) -> object:
    return success_response(
        request,
        await service.list_devices(
            home_id,
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
    home_id: str = Query(...),
    include_runtime_fields: bool = Query(default=True),
    include_editor_fields: bool = Query(default=False),
    service: DeviceCatalogService = Depends(get_device_catalog_service),
) -> object:
    return success_response(
        request,
        await service.get_device_detail(
            home_id,
            device_id,
            include_runtime_fields=include_runtime_fields,
            include_editor_fields=include_editor_fields,
        ),
    )


@router.get("/api/v1/rooms")
async def list_rooms(
    request: Request,
    home_id: str = Query(...),
    include_counts: bool = Query(default=True),
    service: DeviceCatalogService = Depends(get_device_catalog_service),
) -> object:
    return success_response(
        request,
        {
            "rooms": await service.list_rooms(home_id, include_counts=include_counts),
        },
    )


@router.put("/api/v1/device-mappings/{device_id}")
async def update_device_mapping(
    request: Request,
    device_id: str,
    body: DeviceMappingBody = Body(...),
    service: DeviceCatalogService = Depends(get_device_catalog_service),
) -> object:
    return success_response(
        request,
        await service.update_mapping(
            home_id=body.home_id,
            terminal_id=body.terminal_id,
            device_id=device_id,
            room_name=body.room_name,
            device_type=body.device_type,
            is_primary_device=body.is_primary_device,
        ),
    )
