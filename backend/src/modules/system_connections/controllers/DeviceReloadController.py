from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Body, Depends, Request
from pydantic import BaseModel

from src.app.container import get_system_connection_service
from src.modules.system_connections.services.SystemConnectionService import SystemConnectionService
from src.shared.http.ResponseEnvelope import success_response

router = APIRouter(prefix="/api/v1/devices", tags=["system_connections"])


class DeviceReloadBody(BaseModel):
    home_id: str
    terminal_id: str


@router.post("/reload")
async def reload_devices(
    request: Request,
    body: DeviceReloadBody = Body(...),
    service: SystemConnectionService = Depends(get_system_connection_service),
) -> object:
    return success_response(
        request,
        asdict(await service.reload_devices(body.home_id, body.terminal_id)),
    )
