from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Body, Depends, Request
from pydantic import BaseModel, Field

from src.app.container import get_request_context_service, get_system_connection_service
from src.modules.auth.services.query.RequestContextService import RequestContextService
from src.modules.system_connections.services.SystemConnectionService import (
    HomeAssistantCandidateConfig,
    SystemConnectionService,
)
from src.shared.http.ResponseEnvelope import success_response

router = APIRouter(prefix="/api/v1/system-connections", tags=["system_connections"])


class HomeAssistantSaveBody(BaseModel):
    connection_mode: str = Field(default="TOKEN")
    base_url: str
    auth_payload: dict = Field(default_factory=dict)
    member_id: str | None = None


class HomeAssistantCandidateConfigBody(BaseModel):
    connection_mode: str = Field(default="TOKEN")
    base_url: str
    auth_payload: dict = Field(default_factory=dict)


class HomeAssistantTestBody(BaseModel):
    use_saved_config: bool = False
    candidate_config: HomeAssistantCandidateConfigBody | None = None


@router.get("")
async def get_system_connections(
    request: Request,
    service: SystemConnectionService = Depends(get_system_connection_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(
        request,
        require_home=True,
    )
    views = await service.get_system_connections(context.home_id)
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
    body: HomeAssistantSaveBody = Body(...),
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
            await service.save_home_assistant(
                home_id=context.home_id,
                terminal_id=context.terminal_id,
                connection_mode=body.connection_mode,
                base_url=body.base_url,
                auth_payload=body.auth_payload,
                member_id=body.member_id or context.operator_id,
            )
        ),
    )


@router.post("/home-assistant/test")
async def test_home_assistant(
    request: Request,
    body: HomeAssistantTestBody = Body(...),
    service: SystemConnectionService = Depends(get_system_connection_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(
        request,
        require_home=True,
        require_terminal=True,
    )
    candidate_config = (
        None
        if body.candidate_config is None
        else HomeAssistantCandidateConfig(
            connection_mode=body.candidate_config.connection_mode,
            base_url=body.candidate_config.base_url,
            auth_payload=body.candidate_config.auth_payload,
        )
    )
    return success_response(
        request,
        asdict(
            await service.test_home_assistant(
                home_id=context.home_id,
                terminal_id=context.terminal_id,
                use_saved_config=body.use_saved_config,
                candidate_config=candidate_config,
            )
        ),
    )
