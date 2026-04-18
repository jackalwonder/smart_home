from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Depends, Request

from src.app.container import (
    get_management_pin_guard,
    get_request_context_service,
    get_terminal_pairing_code_service,
)
from src.modules.auth.services.command.TerminalPairingCodeService import (
    TerminalPairingClaimInput,
    TerminalPairingCodeService,
    TerminalPairingIssueInput,
    TerminalPairingPollInput,
)
from src.modules.auth.services.guard.ManagementPinGuard import ManagementPinGuard
from src.modules.auth.services.query.RequestContextService import RequestContextService
from src.shared.http.ApiSchema import ApiSchema
from src.shared.http.ResponseEnvelope import SuccessEnvelope, success_response

router = APIRouter(prefix="/api/v1/terminals", tags=["terminals"])


class TerminalPairingIssueResponse(ApiSchema):
    pairing_id: str
    terminal_id: str
    terminal_code: str
    terminal_name: str
    terminal_mode: str
    pairing_code: str
    expires_at: str
    status: str


class TerminalPairingPollResponse(ApiSchema):
    pairing_id: str
    terminal_id: str
    terminal_code: str
    terminal_name: str
    terminal_mode: str
    status: str
    expires_at: str
    claimed_at: str | None = None
    bootstrap_token: str | None = None
    bootstrap_token_expires_at: str | None = None


class TerminalPairingClaimBody(ApiSchema):
    pairing_code: str


class TerminalPairingClaimResponse(ApiSchema):
    pairing_id: str
    terminal_id: str
    terminal_code: str
    terminal_name: str
    terminal_mode: str
    status: str
    claimed_at: str
    bootstrap_token_expires_at: str
    rotated: bool


@router.post(
    "/{terminal_id}/pairing-code-sessions",
    response_model=SuccessEnvelope[TerminalPairingIssueResponse],
)
async def issue_terminal_pairing_code(
    terminal_id: str,
    request: Request,
    service: TerminalPairingCodeService = Depends(get_terminal_pairing_code_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    context = await request_context_service.resolve_http_request(
        request,
        explicit_terminal_id=terminal_id,
        require_home=True,
        require_terminal=True,
        require_bearer=False,
    )
    view = await service.issue(
        TerminalPairingIssueInput(
            home_id=context.home_id or "",
            terminal_id=context.terminal_id or terminal_id,
        )
    )
    return success_response(request, TerminalPairingIssueResponse.model_validate(asdict(view)))


@router.get(
    "/{terminal_id}/pairing-code-sessions/{pairing_id}",
    response_model=SuccessEnvelope[TerminalPairingPollResponse],
)
async def poll_terminal_pairing_code(
    terminal_id: str,
    pairing_id: str,
    request: Request,
    service: TerminalPairingCodeService = Depends(get_terminal_pairing_code_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> object:
    await request_context_service.resolve_http_request(
        request,
        explicit_terminal_id=terminal_id,
        require_home=True,
        require_terminal=True,
        require_bearer=False,
    )
    view = await service.poll(
        TerminalPairingPollInput(
            terminal_id=terminal_id,
            pairing_id=pairing_id,
        )
    )
    return success_response(request, TerminalPairingPollResponse.model_validate(asdict(view)))


@router.post(
    "/pairing-code-claims",
    response_model=SuccessEnvelope[TerminalPairingClaimResponse],
)
async def claim_terminal_pairing_code(
    body: TerminalPairingClaimBody,
    request: Request,
    service: TerminalPairingCodeService = Depends(get_terminal_pairing_code_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
    management_pin_guard: ManagementPinGuard = Depends(get_management_pin_guard),
) -> object:
    context = await request_context_service.resolve_http_request(
        request,
        require_home=True,
        require_terminal=True,
    )
    await management_pin_guard.require_active_session(context.home_id, context.terminal_id)
    view = await service.claim(
        TerminalPairingClaimInput(
            home_id=context.home_id or "",
            pairing_code=body.pairing_code,
            claimed_by_member_id=context.operator_id,
            claimed_by_terminal_id=context.terminal_id or "",
        )
    )
    return success_response(request, TerminalPairingClaimResponse.model_validate(asdict(view)))
