from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Body, Depends, Query, Request
from pydantic import Field

from src.app.container import get_pin_verification_service, get_request_context_service
from src.modules.auth.services.command.PinVerificationService import (
    PinVerificationInput,
    PinSessionStatusView,
    PinVerificationService,
    PinVerificationView,
)
from src.modules.auth.services.query.RequestContextService import RequestContextService
from src.shared.http.ApiSchema import ApiSchema
from src.shared.http.ResponseEnvelope import SuccessEnvelope, success_response

router = APIRouter(prefix="/api/v1/auth/pin", tags=["auth"])


class PinVerifyRequestBody(ApiSchema):
    home_id: str = Field(...)
    terminal_id: str = Field(...)
    pin: str = Field(...)
    target_action: str | None = None
    member_id: str | None = None


class PinVerifyResponse(ApiSchema):
    verified: bool
    pin_session_active: bool
    pin_session_expires_at: str
    remaining_attempts: int
    lock_until: str | None = None


class PinSessionResponse(ApiSchema):
    pin_session_active: bool
    pin_session_expires_at: str | None = None
    remaining_lock_seconds: int = 0


@router.post(
    "/verify",
    response_model=SuccessEnvelope[PinVerifyResponse],
)
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
    response = success_response(
        request,
        PinVerifyResponse(
            verified=view.verified,
            pin_session_active=view.pin_session_active,
            pin_session_expires_at=view.pin_session_expires_at,
            remaining_attempts=view.remaining_attempts,
            lock_until=view.lock_until,
        ),
    )
    if view.session_token is not None:
        response.set_cookie(
            key="pin_session_token",
            value=view.session_token,
            httponly=True,
            samesite="lax",
        )
        response.set_cookie(key="home_id", value=body.home_id, httponly=False, samesite="lax")
        response.set_cookie(
            key="terminal_id",
            value=body.terminal_id,
            httponly=False,
            samesite="lax",
        )
    return response


@router.get(
    "/session",
    response_model=SuccessEnvelope[PinSessionResponse],
)
async def get_pin_session(
    request: Request,
    home_id: str | None = Query(
        default=None,
        description="Legacy compatibility context field.",
        deprecated=True,
    ),
    terminal_id: str | None = Query(
        default=None,
        description="Legacy compatibility context field.",
        deprecated=True,
    ),
    service: PinVerificationService = Depends(get_pin_verification_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(
        request,
        explicit_home_id=home_id,
        explicit_terminal_id=terminal_id,
        require_home=True,
        require_terminal=True,
    )
    view: PinSessionStatusView = await service.get_session_status(
        context.home_id,
        context.terminal_id,
    )
    return success_response(request, PinSessionResponse.model_validate(asdict(view)))
