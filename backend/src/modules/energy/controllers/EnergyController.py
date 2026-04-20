from __future__ import annotations

from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, Body, Depends, Query, Request
from pydantic import Field

from src.app.container import get_energy_service, get_request_context_service
from src.modules.auth.services.query.RequestContextService import RequestContextService
from src.modules.energy.services.EnergyService import EnergyService
from src.shared.http.ApiSchema import ApiSchema
from src.shared.http.ResponseEnvelope import SuccessEnvelope, success_response

router = APIRouter(prefix="/api/v1/energy", tags=["energy"])


class EnergyBindingBody(ApiSchema):
    home_id: str | None = Field(
        default=None,
        description="Legacy compatibility context field.",
        json_schema_extra={"deprecated": True},
    )
    terminal_id: str | None = Field(
        default=None,
        description="Legacy compatibility context field.",
        json_schema_extra={"deprecated": True},
    )
    payload: dict = Field(default_factory=dict)
    member_id: str | None = None


class EnergyResponse(ApiSchema):
    binding_status: str
    refresh_status: str | None = None
    yesterday_usage: float | None = None
    monthly_usage: float | None = None
    balance: float | None = None
    yearly_usage: float | None = None
    updated_at: str | None = None
    cache_mode: bool
    last_error_code: str | None = None
    provider: str | None = None
    account_id_masked: str | None = None
    entity_map: dict[str, str] = Field(default_factory=dict)


class EnergyBindingResponse(ApiSchema):
    saved: bool
    binding_status: str
    updated_at: str
    message: str


class EnergyRefreshResponse(ApiSchema):
    accepted: bool
    refresh_status: str
    started_at: str
    timeout_seconds: int


@router.get("", response_model=SuccessEnvelope[EnergyResponse])
async def get_energy(
    request: Request,
    service: EnergyService = Depends(get_energy_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(request, require_home=True)
    payload = asdict(await service.get_energy(context.home_id))
    return success_response(request, EnergyResponse.model_validate(payload))


@router.put("/binding", response_model=SuccessEnvelope[EnergyBindingResponse])
async def put_energy_binding(
    request: Request,
    body: EnergyBindingBody = Body(...),
    service: EnergyService = Depends(get_energy_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(
        request,
        explicit_home_id=body.home_id,
        explicit_terminal_id=body.terminal_id,
        require_home=True,
        require_terminal=True,
    )
    payload = asdict(
        await service.update_binding(
            context.home_id,
            context.terminal_id,
            body.payload,
            body.member_id or context.operator_id,
        )
    )
    return success_response(request, EnergyBindingResponse.model_validate(payload))


@router.delete("/binding", response_model=SuccessEnvelope[EnergyBindingResponse])
async def delete_energy_binding(
    request: Request,
    body: EnergyBindingBody = Body(...),
    service: EnergyService = Depends(get_energy_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(
        request,
        explicit_home_id=body.home_id,
        explicit_terminal_id=body.terminal_id,
        require_home=True,
        require_terminal=True,
    )
    payload = asdict(
        await service.delete_binding(
            context.home_id,
            context.terminal_id,
            body.member_id or context.operator_id,
        )
    )
    return success_response(request, EnergyBindingResponse.model_validate(payload))


@router.post("/refresh", response_model=SuccessEnvelope[EnergyRefreshResponse])
async def post_energy_refresh(
    request: Request,
    body: EnergyBindingBody = Body(...),
    service: EnergyService = Depends(get_energy_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(
        request,
        explicit_home_id=body.home_id,
        explicit_terminal_id=body.terminal_id,
        require_home=True,
        require_terminal=True,
    )
    payload = asdict(await service.refresh(context.home_id, context.terminal_id))
    return success_response(request, EnergyRefreshResponse.model_validate(payload))
