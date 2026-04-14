from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Body, Depends, Query, Request
from pydantic import BaseModel, Field

from src.app.container import get_system_connection_service
from src.modules.system_connections.services.SystemConnectionService import SystemConnectionService
from src.shared.http.ResponseEnvelope import success_response

router = APIRouter(prefix="/api/v1/system-connections", tags=["system_connections"])


class HomeAssistantConfigBody(BaseModel):
    home_id: str
    terminal_id: str
    connection_mode: str = Field(default="TOKEN")
    base_url: str
    auth_payload: dict = Field(default_factory=dict)
    member_id: str | None = None


@router.get("")
async def get_system_connections(
    request: Request,
    home_id: str = Query(...),
    service: SystemConnectionService = Depends(get_system_connection_service),
) -> object:
    views = await service.get_system_connections(home_id)
    current = views[0] if views else None
    return success_response(
        request,
        {
            "home_assistant": asdict(current) if current is not None else None,
            "settings_version": current.settings_version if current is not None else None,
        },
    )


@router.put("/home-assistant")
async def save_home_assistant(
    request: Request,
    body: HomeAssistantConfigBody = Body(...),
    service: SystemConnectionService = Depends(get_system_connection_service),
) -> object:
    return success_response(
        request,
        asdict(
            await service.save_home_assistant(
            home_id=body.home_id,
            terminal_id=body.terminal_id,
            connection_mode=body.connection_mode,
            base_url=body.base_url,
            auth_payload=body.auth_payload,
            member_id=body.member_id,
            )
        ),
    )


@router.post("/home-assistant/test")
async def test_home_assistant(
    request: Request,
    body: HomeAssistantConfigBody = Body(...),
    service: SystemConnectionService = Depends(get_system_connection_service),
) -> object:
    return success_response(
        request,
        asdict(
            await service.test_home_assistant(
            home_id=body.home_id,
            terminal_id=body.terminal_id,
            base_url=body.base_url,
            auth_payload=body.auth_payload,
            )
        ),
    )
