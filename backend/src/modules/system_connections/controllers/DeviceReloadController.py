from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Body, Depends, Request
from pydantic import BaseModel

from src.app.container import get_request_context_service, get_system_connection_service
from src.modules.auth.services.query.RequestContextService import RequestContextService
from src.modules.system_connections.services.SystemConnectionService import SystemConnectionService
from src.shared.http.ResponseEnvelope import success_response

router = APIRouter(prefix="/api/v1/devices", tags=["system_connections"])


class DeviceReloadBody(BaseModel):
    force_full_sync: bool = False


@router.post("/reload")
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
    return success_response(
        request,
        asdict(
            await service.reload_devices(
                context.home_id,
                context.terminal_id,
                force_full_sync=body.force_full_sync,
            )
        ),
    )
