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
    BootstrapTokenStatusInput,
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


class TerminalBootstrapTokenStatusResponse(ApiSchema):
    terminal_id: str
    terminal_mode: str
    token_configured: bool
    issued_at: str | None = None
    expires_at: str | None = None
    last_used_at: str | None = None


class TerminalBootstrapTokenDirectoryItemResponse(ApiSchema):
    terminal_id: str
    terminal_code: str
    terminal_name: str
    terminal_mode: str
    token_configured: bool
    issued_at: str | None = None
    expires_at: str | None = None
    last_used_at: str | None = None


class TerminalBootstrapTokenDirectoryResponse(ApiSchema):
    items: list[TerminalBootstrapTokenDirectoryItemResponse]


class TerminalBootstrapTokenAuditItemResponse(ApiSchema):
    audit_id: str
    terminal_id: str
    terminal_code: str
    terminal_name: str
    action_type: str
    operator_id: str | None = None
    operator_name: str | None = None
    acting_terminal_id: str | None = None
    acting_terminal_name: str | None = None
    before_version: str | None = None
    after_version: str | None = None
    result_status: str
    expires_at: str | None = None
    rotated: bool | None = None
    created_at: str


class TerminalBootstrapTokenAuditListResponse(ApiSchema):
    items: list[TerminalBootstrapTokenAuditItemResponse]


@router.get(
    "/bootstrap-tokens",
    response_model=SuccessEnvelope[TerminalBootstrapTokenDirectoryResponse],
)
async def list_bootstrap_token_directory(
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
    items = await service.list_terminals(home_id=context.home_id)
    return success_response(
        request,
        TerminalBootstrapTokenDirectoryResponse(
            items=[
                TerminalBootstrapTokenDirectoryItemResponse.model_validate(asdict(item))
                for item in items
            ]
        ),
    )


@router.get(
    "/bootstrap-token-audits",
    response_model=SuccessEnvelope[TerminalBootstrapTokenAuditListResponse],
)
async def list_bootstrap_token_audits(
    request: Request,
    limit: int = 20,
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
    items = await service.list_audits(home_id=context.home_id, limit=limit)
    return success_response(
        request,
        TerminalBootstrapTokenAuditListResponse(
            items=[
                TerminalBootstrapTokenAuditItemResponse.model_validate(asdict(item))
                for item in items
            ]
        ),
    )


@router.get(
    "/{terminal_id}/bootstrap-token",
    response_model=SuccessEnvelope[TerminalBootstrapTokenStatusResponse],
)
async def get_bootstrap_token_status(
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
    view = await service.get_status(
        BootstrapTokenStatusInput(
            home_id=context.home_id,
            target_terminal_id=terminal_id,
        )
    )
    return success_response(
        request,
        TerminalBootstrapTokenStatusResponse.model_validate(asdict(view)),
    )


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
