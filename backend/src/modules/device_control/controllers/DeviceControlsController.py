from __future__ import annotations

from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, Body, Depends, Request
from pydantic import BaseModel, ConfigDict, Field

from src.app.container import (
    get_device_control_command_service,
    get_device_control_result_query_service,
    get_request_context_service,
)
from src.modules.auth.services.query.RequestContextService import RequestContextService
from src.modules.device_control.services.command.DeviceControlCommandService import (
    DeviceControlAcceptedView,
    DeviceControlCommandInput,
    DeviceControlCommandService,
)
from src.modules.device_control.services.query.DeviceControlResultQueryService import (
    DeviceControlResultQueryInput,
    DeviceControlResultQueryService,
)
from src.shared.http.ResponseEnvelope import success_response

router = APIRouter(prefix="/api/v1/device-controls", tags=["device_control"])


class DeviceControlPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_scope: str | None = None
    target_key: str | None = None
    value: Any = None
    unit: str | None = None


class DeviceControlRequestBody(BaseModel):
    home_id: str | None = Field(default=None)
    request_id: str = Field(...)
    device_id: str = Field(...)
    action_type: str = Field(...)
    payload: DeviceControlPayload = Field(default_factory=DeviceControlPayload)
    client_ts: str | None = None


class DeviceControlAcceptedResponse(BaseModel):
    request_id: str
    device_id: str
    accepted: bool
    acceptance_status: str
    confirmation_type: str
    accepted_at: str | None = None
    timeout_seconds: int
    retry_scheduled: bool
    message: str
    result_query_path: str


class DeviceControlResultResponse(BaseModel):
    request_id: str
    device_id: str
    action_type: str
    payload: dict
    acceptance_status: str
    confirmation_type: str
    execution_status: str
    retry_count: int
    final_runtime_state: dict | None = None
    error_code: str | None = None
    error_message: str | None = None
    accepted_at: str | None = None
    completed_at: str | None = None


@router.post("", status_code=202)
async def accept_device_control(
    request: Request,
    body: DeviceControlRequestBody = Body(...),
    service: DeviceControlCommandService = Depends(get_device_control_command_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    base_context = await request_context_service.resolve_http_request(
        request,
        explicit_home_id=body.home_id,
        require_home=False,
    )
    fallback_home_id = base_context.home_id
    if fallback_home_id is None:
        fallback_home_id = await request_context_service.find_home_id_by_device_id(body.device_id)
    context = await request_context_service.resolve_http_request(
        request,
        explicit_home_id=body.home_id,
        fallback_home_id=fallback_home_id,
        require_home=True,
    )
    view: DeviceControlAcceptedView = await service.accept(
        DeviceControlCommandInput(
            home_id=context.home_id,
            request_id=body.request_id,
            device_id=body.device_id,
            action_type=body.action_type,
            payload=body.payload.model_dump(),
            client_ts=body.client_ts,
        )
    )
    return success_response(
        request,
        DeviceControlAcceptedResponse.model_validate(asdict(view)),
        status_code=202,
    )


@router.get("/{request_id}")
async def get_device_control_result(
    request: Request,
    request_id: str,
    service: DeviceControlResultQueryService = Depends(get_device_control_result_query_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    base_context = await request_context_service.resolve_http_request(
        request,
        require_home=False,
    )
    fallback_home_id = base_context.home_id
    if fallback_home_id is None:
        fallback_home_id = await request_context_service.find_home_id_by_control_request_id(request_id)
    context = await request_context_service.resolve_http_request(
        request,
        fallback_home_id=fallback_home_id,
        require_home=True,
    )
    view = await service.get_result(
        DeviceControlResultQueryInput(home_id=context.home_id, request_id=request_id)
    )
    return success_response(request, DeviceControlResultResponse.model_validate(asdict(view)))
