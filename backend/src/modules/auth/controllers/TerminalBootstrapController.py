from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Depends, Request

from src.app.container import (
    get_bootstrap_token_service,
    get_management_pin_guard,
    get_request_context_service,
)
from src.modules.auth.services.command.BootstrapTokenService import (
    BootstrapTokenCreateInput,
    BootstrapTokenService,
)
from src.modules.auth.services.guard.ManagementPinGuard import ManagementPinGuard
from src.modules.auth.services.query.RequestContextService import RequestContextService
from src.shared.http.ApiSchema import ApiSchema
from src.shared.http.ResponseEnvelope import SuccessEnvelope, success_response

router = APIRouter(prefix="/api/v1/terminals", tags=["terminals"])


class TerminalBootstrapTokenResponse(ApiSchema):
    terminal_id: str
    bootstrap_token: str
    expires_at: str
    token_type: str = "Bootstrap"
    scope: list[str]
    rotated: bool


@router.post(
    "/{terminal_id}/bootstrap-token",
    response_model=SuccessEnvelope[TerminalBootstrapTokenResponse],
)
async def create_or_reset_bootstrap_token(
    terminal_id: str,
    request: Request,
    service: BootstrapTokenService = Depends(get_bootstrap_token_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
    management_pin_guard: ManagementPinGuard = Depends(get_management_pin_guard),
) -> object:
    context = await request_context_service.resolve_http_request(
        request,
        require_home=True,
        require_terminal=True,
    )
    await management_pin_guard.require_active_session(context.home_id, context.terminal_id)
    view = await service.create_or_reset(
        BootstrapTokenCreateInput(
            home_id=context.home_id,
            target_terminal_id=terminal_id,
            created_by_member_id=context.operator_id,
            created_by_terminal_id=context.terminal_id,
        )
    )
    return success_response(request, TerminalBootstrapTokenResponse.model_validate(asdict(view)))
