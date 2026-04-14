from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Body, Depends, Query, Request
from pydantic import BaseModel, Field

from src.app.container import get_energy_service
from src.modules.energy.services.EnergyService import EnergyService
from src.shared.http.ResponseEnvelope import success_response

router = APIRouter(prefix="/api/v1/energy", tags=["energy"])


class EnergyBindingBody(BaseModel):
    home_id: str
    terminal_id: str
    payload: dict = Field(default_factory=dict)
    member_id: str | None = None


@router.get("")
async def get_energy(
    request: Request,
    home_id: str = Query(...),
    service: EnergyService = Depends(get_energy_service),
) -> object:
    return success_response(request, asdict(await service.get_energy(home_id)))


@router.put("/binding")
async def put_energy_binding(
    request: Request,
    body: EnergyBindingBody = Body(...),
    service: EnergyService = Depends(get_energy_service),
) -> object:
    return success_response(
        request,
        asdict(await service.update_binding(body.home_id, body.terminal_id, body.payload, body.member_id)),
    )


@router.delete("/binding")
async def delete_energy_binding(
    request: Request,
    body: EnergyBindingBody = Body(...),
    service: EnergyService = Depends(get_energy_service),
) -> object:
    return success_response(
        request,
        asdict(await service.delete_binding(body.home_id, body.terminal_id, body.member_id)),
    )


@router.post("/refresh")
async def post_energy_refresh(
    request: Request,
    body: EnergyBindingBody = Body(...),
    service: EnergyService = Depends(get_energy_service),
) -> object:
    return success_response(request, asdict(await service.refresh(body.home_id, body.terminal_id)))
