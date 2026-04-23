from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Body, Depends, Request
from pydantic import Field

from src.app.container import get_request_context_service, get_system_connection_service
from src.modules.auth.services.query.RequestContextService import RequestContextService
from src.modules.system_connections.services.SystemConnectionService import (
    HomeAssistantCandidateConfig,
    SystemConnectionService,
)
from src.shared.http.ApiSchema import ApiSchema
from src.shared.http.ResponseEnvelope import SuccessEnvelope, success_response

router = APIRouter(prefix="/api/v1/system-connections", tags=["system_connections"])


class HomeAssistantSaveBody(ApiSchema):
    connection_mode: str = Field(default="TOKEN")
    base_url: str
    auth_payload: dict = Field(default_factory=dict)
    member_id: str | None = None


class HomeAssistantCandidateConfigBody(ApiSchema):
    connection_mode: str = Field(default="TOKEN")
    base_url: str
    auth_payload: dict = Field(default_factory=dict)


class HomeAssistantTestBody(ApiSchema):
    use_saved_config: bool = False
    candidate_config: HomeAssistantCandidateConfigBody | None = None


class SystemConnectionResponse(ApiSchema):
    connection_mode: str | None = None
    base_url_masked: str | None = None
    connection_status: str
    auth_configured: bool
    settings_version: str | None = None
    last_test_at: str | None = None
    last_test_result: str | None = None
    last_sync_at: str | None = None
    last_sync_result: str | None = None


class SystemConnectionsEnvelopeResponse(ApiSchema):
    home_assistant: SystemConnectionResponse | None = None
    settings_version: str | None = None


class SystemConnectionSaveResponse(ApiSchema):
    saved: bool
    connection_status: str
    updated_at: str
    message: str


class SystemConnectionTestResponse(ApiSchema):
    tested: bool
    connection_status: str
    latency_ms: int | None = None
    tested_at: str
    message: str | None = None


@router.get("", response_model=SuccessEnvelope[SystemConnectionsEnvelopeResponse])
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
    payload = {
        "home_assistant": asdict(current) if current is not None else None,
        "settings_version": current.settings_version if current is not None else None,
    }
    return success_response(request, SystemConnectionsEnvelopeResponse.model_validate(payload))


@router.put("/home-assistant", response_model=SuccessEnvelope[SystemConnectionSaveResponse])
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
    payload = asdict(
        await service.save_home_assistant(
            home_id=context.home_id,
            terminal_id=context.terminal_id,
            connection_mode=body.connection_mode,
            base_url=body.base_url,
            auth_payload=body.auth_payload,
            member_id=body.member_id or context.operator_id,
        )
    )
    return success_response(request, SystemConnectionSaveResponse.model_validate(payload))


@router.post("/home-assistant/test", response_model=SuccessEnvelope[SystemConnectionTestResponse])
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
    payload = asdict(
        await service.test_home_assistant(
            home_id=context.home_id,
            terminal_id=context.terminal_id,
            use_saved_config=body.use_saved_config,
            candidate_config=candidate_config,
        )
    )
    return success_response(request, SystemConnectionTestResponse.model_validate(payload))
