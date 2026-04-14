from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Body, Depends, Query, Request
from pydantic import BaseModel, Field

from src.app.container import get_pin_verification_service
from src.modules.auth.services.command.PinVerificationService import (
    PinVerificationInput,
    PinSessionStatusView,
    PinVerificationService,
    PinVerificationView,
)
from src.shared.http.ResponseEnvelope import success_response

router = APIRouter(prefix="/api/v1/auth/pin", tags=["auth"])


class PinVerifyRequestBody(BaseModel):
    home_id: str = Field(...)
    terminal_id: str = Field(...)
    pin: str = Field(...)
    target_action: str | None = None
    member_id: str | None = None


class PinVerifyResponse(BaseModel):
    verified: bool
    pin_session_active: bool
    pin_session_expires_at: str
    remaining_attempts: int
    lock_until: str | None = None


class PinSessionResponse(BaseModel):
    pin_session_active: bool
    pin_session_expires_at: str | None = None
    remaining_lock_seconds: int = 0


@router.post("/verify")
async def verify_pin(
    request: Request,
    body: PinVerifyRequestBody = Body(...),
    service: PinVerificationService = Depends(get_pin_verification_service),
) -> object:
    view: PinVerificationView = await service.verify(
        PinVerificationInput(
            home_id=body.home_id,
            terminal_id=body.terminal_id,
            pin=body.pin,
            target_action=body.target_action,
            member_id=body.member_id,
        )
    )
    return success_response(request, PinVerifyResponse.model_validate(asdict(view)))


@router.get("/session")
async def get_pin_session(
    request: Request,
    home_id: str = Query(...),
    terminal_id: str = Query(...),
    service: PinVerificationService = Depends(get_pin_verification_service),
) -> object:
    view: PinSessionStatusView = await service.get_session_status(home_id, terminal_id)
    return success_response(request, PinSessionResponse.model_validate(asdict(view)))
