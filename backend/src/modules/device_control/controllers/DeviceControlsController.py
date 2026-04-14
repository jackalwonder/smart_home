from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Body, Depends
from pydantic import BaseModel, Field

from src.app.container import get_device_control_command_service
from src.modules.device_control.services.command.DeviceControlCommandService import (
    DeviceControlAcceptedView,
    DeviceControlCommandInput,
    DeviceControlCommandService,
)

router = APIRouter(prefix="/api/v1/device-controls", tags=["device_control"])


class DeviceControlRequestBody(BaseModel):
    home_id: str = Field(...)
    request_id: str = Field(...)
    device_id: str = Field(...)
    action_type: str = Field(...)
    payload: dict = Field(default_factory=dict)
    client_ts: str | None = None


class DeviceControlAcceptedResponse(BaseModel):
    request_id: str
    device_id: str
    acceptance_status: str
    execution_status: str
@router.post("", response_model=DeviceControlAcceptedResponse)
async def accept_device_control(
    body: DeviceControlRequestBody = Body(...),
    service: DeviceControlCommandService = Depends(get_device_control_command_service),
) -> DeviceControlAcceptedResponse:
    view: DeviceControlAcceptedView = await service.accept(
        DeviceControlCommandInput(
            home_id=body.home_id,
            request_id=body.request_id,
            device_id=body.device_id,
            action_type=body.action_type,
            payload=body.payload,
            client_ts=body.client_ts,
        )
    )
    return DeviceControlAcceptedResponse.model_validate(asdict(view))
