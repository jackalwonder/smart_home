from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, Query, Request
from pydantic import Field

from src.app.container import get_device_catalog_service, get_request_context_service
from src.modules.auth.services.query.RequestContextService import RequestContextService
from src.modules.home_overview.services.DeviceCatalogService import DeviceCatalogService
from src.shared.http.ApiSchema import ApiSchema
from src.shared.http.ResponseEnvelope import SuccessEnvelope, success_response

router = APIRouter(tags=["devices"])


class DeviceMappingBody(ApiSchema):
    room_id: str | None = None
    device_type: str | None = None
    is_primary_device: bool | None = None
    default_control_target: str | None = None


class DeviceAlertBadge(ApiSchema):
    code: str
    level: str
    text: str


class DeviceRuntimeState(ApiSchema):
    last_state_update_at: str | None = None
    aggregated_state: str | None = None
    aggregated_mode: str | None = None
    aggregated_position: float | None = None
    telemetry: dict[str, Any] = Field(default_factory=dict)
    alerts: list[DeviceAlertBadge] = Field(default_factory=list)


class DeviceControlSchemaItem(ApiSchema):
    action_type: str
    target_scope: str | None = None
    target_key: str | None = None
    value_type: str | None = None
    value_range: dict[str, Any] | None = None
    allowed_values: list[Any] | None = None
    unit: str | None = None
    is_quick_action: bool
    requires_detail_entry: bool


class DeviceDetailResponse(ApiSchema):
    device_id: str
    display_name: str
    raw_name: str | None = None
    device_type: str
    room_id: str | None = None
    room_name: str | None = None
    status: str
    is_offline: bool
    is_complex_device: bool
    is_readonly_device: bool
    confirmation_type: str | None = None
    entry_behavior: str | None = None
    default_control_target: str | None = None
    capabilities: dict[str, Any] = Field(default_factory=dict)
    alert_badges: list[DeviceAlertBadge] = Field(default_factory=list)
    status_summary: dict[str, Any] = Field(default_factory=dict)
    runtime_state: DeviceRuntimeState | None = None
    control_schema: list[DeviceControlSchemaItem] = Field(default_factory=list)
    editor_config: dict[str, Any] | None = None
    source_info: dict[str, Any] = Field(default_factory=dict)


@router.get("/api/v1/devices", response_model=SuccessEnvelope[dict[str, Any]])
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


@router.get("/api/v1/devices/{device_id}", response_model=SuccessEnvelope[DeviceDetailResponse])
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


@router.get("/api/v1/rooms", response_model=SuccessEnvelope[dict[str, list[dict[str, Any]]]])
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


@router.put("/api/v1/device-mappings/{device_id}", response_model=SuccessEnvelope[dict[str, Any]])
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
