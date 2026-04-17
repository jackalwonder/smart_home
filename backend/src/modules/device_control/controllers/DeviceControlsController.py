from __future__ import annotations

from dataclasses import asdict
from typing import Any, Literal

from fastapi import APIRouter, Body, Depends, Request
from pydantic import ConfigDict, Field, field_validator

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
from src.shared.http.ApiSchema import ApiSchema
from src.shared.http.ResponseEnvelope import SuccessEnvelope, success_response

router = APIRouter(prefix="/api/v1/device-controls", tags=["device_control"])


class DeviceControlPayload(ApiSchema):
    model_config = ConfigDict(extra="forbid")

    target_scope: str | None = None
    target_key: str | None = None
    value: Any = None
    unit: str | None = None

    @field_validator("target_scope", "target_key", "unit", mode="before")
    @classmethod
    def normalize_optional_strings(cls, value: Any) -> Any:
        if not isinstance(value, str):
            return value
        normalized = value.strip()
        return normalized or None


class DeviceControlRequestBody(ApiSchema):
    model_config = ConfigDict(extra="forbid")

    home_id: str | None = Field(default=None, description="Legacy compatibility context field.")
    request_id: str = Field(...)
    device_id: str = Field(...)
    action_type: str = Field(...)
    payload: DeviceControlPayload = Field(default_factory=DeviceControlPayload)
    client_ts: str | None = None

    @field_validator("home_id", "client_ts", mode="before")
    @classmethod
    def normalize_nullable_strings(cls, value: Any) -> Any:
        if not isinstance(value, str):
            return value
        normalized = value.strip()
        return normalized or None

    @field_validator("request_id", "device_id", "action_type", mode="before")
    @classmethod
    def normalize_required_strings(cls, value: Any) -> Any:
        if not isinstance(value, str):
            return value
        normalized = value.strip()
        if not normalized:
            raise ValueError("must not be blank")
        return normalized


class DeviceControlAcceptedResponse(ApiSchema):
    request_id: str
    device_id: str
    accepted: bool
    acceptance_status: Literal["ACCEPTED"]
    confirmation_type: Literal["ACK_DRIVEN", "STATE_DRIVEN", "PLAYBACK_STATE_DRIVEN"]
    accepted_at: str | None = None
    timeout_seconds: int
    retry_scheduled: bool
    message: str
    result_query_path: str


class DeviceControlResultResponse(ApiSchema):
    request_id: str
    device_id: str
    action_type: str
    payload: dict
    acceptance_status: Literal["ACCEPTED"]
    confirmation_type: Literal["ACK_DRIVEN", "STATE_DRIVEN", "PLAYBACK_STATE_DRIVEN"]
    execution_status: Literal["PENDING", "SUCCESS", "FAILED", "TIMEOUT", "STATE_MISMATCH"]
    retry_count: int
    final_runtime_state: dict | None = None
    error_code: str | None = None
    error_message: str | None = None
    accepted_at: str | None = None
    completed_at: str | None = None


@router.post(
    "",
    status_code=202,
    response_model=SuccessEnvelope[DeviceControlAcceptedResponse],
)
async def accept_device_control(
    request: Request,
    body: DeviceControlRequestBody = Body(...),
    service: DeviceControlCommandService = Depends(get_device_control_command_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(
        request,
        explicit_home_id=body.home_id,
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


@router.get(
    "/{request_id}",
    response_model=SuccessEnvelope[DeviceControlResultResponse],
)
async def get_device_control_result(
    request: Request,
    request_id: str,
    service: DeviceControlResultQueryService = Depends(get_device_control_result_query_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(
        request,
        require_home=True,
    )
    view = await service.get_result(
        DeviceControlResultQueryInput(home_id=context.home_id, request_id=request_id)
    )
    return success_response(request, DeviceControlResultResponse.model_validate(asdict(view)))
