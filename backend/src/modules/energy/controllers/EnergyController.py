from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Body, Depends, Query, Request
from pydantic import BaseModel, Field

from src.app.container import get_energy_service, get_request_context_service
from src.modules.auth.services.query.RequestContextService import RequestContextService
from src.modules.energy.services.EnergyService import EnergyService
from src.shared.http.ResponseEnvelope import success_response

router = APIRouter(prefix="/api/v1/energy", tags=["energy"])


class EnergyBindingBody(BaseModel):
    home_id: str | None = None
    terminal_id: str | None = None
    payload: dict = Field(default_factory=dict)
    member_id: str | None = None


@router.get("")
async def get_energy(
    request: Request,
    service: EnergyService = Depends(get_energy_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(request, require_home=True)
    return success_response(request, asdict(await service.get_energy(context.home_id)))


@router.put("/binding")
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
    return success_response(
        request,
        asdict(
            await service.update_binding(
                context.home_id,
                context.terminal_id,
                body.payload,
                body.member_id or context.operator_id,
            )
        ),
    )


@router.delete("/binding")
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
    return success_response(
        request,
        asdict(
            await service.delete_binding(
                context.home_id,
                context.terminal_id,
                body.member_id or context.operator_id,
            )
        ),
    )


@router.post("/refresh")
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
    return success_response(
        request,
        asdict(await service.refresh(context.home_id, context.terminal_id)),
    )
