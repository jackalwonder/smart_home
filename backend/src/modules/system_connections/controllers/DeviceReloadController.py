from __future__ import annotations

from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, Body, Depends, Request

from src.app.container import get_request_context_service, get_system_connection_service
from src.modules.auth.services.query.RequestContextService import RequestContextService
from src.modules.system_connections.services.SystemConnectionService import SystemConnectionService
from src.shared.http.ApiSchema import ApiSchema
from src.shared.http.ResponseEnvelope import SuccessEnvelope, success_response

router = APIRouter(prefix="/api/v1/devices", tags=["system_connections"])


class DeviceReloadBody(ApiSchema):
    force_full_sync: bool = False


class DeviceReloadResponse(ApiSchema):
    accepted: bool
    reload_status: str
    started_at: str
    message: str


@router.post("/reload", response_model=SuccessEnvelope[DeviceReloadResponse])
async def reload_devices(
    request: Request,
    body: DeviceReloadBody = Body(...),
    service: SystemConnectionService = Depends(get_system_connection_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(
        request,
        require_home=True,
        require_terminal=True,
    )
    payload = asdict(
        await service.reload_devices(
            context.home_id,
            context.terminal_id,
            force_full_sync=body.force_full_sync,
        )
    )
    return success_response(request, DeviceReloadResponse.model_validate(payload))
