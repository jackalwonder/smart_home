from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Depends, Request

from src.app.container import (
    get_access_token_resolver,
    get_request_context_service,
    get_session_query_service,
)
from src.modules.auth.services.query.AccessTokenResolver import AccessTokenResolver
from src.modules.auth.services.query.RequestContextService import RequestContextService
from src.modules.auth.services.query.SessionQueryService import (
    AuthSessionView,
    SessionQueryInput,
    SessionQueryService,
)
from src.shared.http.ApiSchema import ApiSchema
from src.shared.http.ResponseEnvelope import SuccessEnvelope, success_response

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class AuthSessionResponse(ApiSchema):
    home_id: str
    operator_id: str | None = None
    terminal_id: str
    terminal_mode: str
    login_mode: str
    access_token: str
    access_token_expires_at: str | None = None
    token_type: str = "Bearer"
    scope: list[str]
    pin_session_active: bool
    pin_session_expires_at: str | None = None
    features: dict[str, bool]


@router.get(
    "/session",
    response_model=SuccessEnvelope[AuthSessionResponse],
)
async def get_auth_session(
    request: Request,
    service: SessionQueryService = Depends(get_session_query_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
    access_token_resolver: AccessTokenResolver = Depends(get_access_token_resolver),
) -> object:
    context = await request_context_service.resolve_http_request(
        request,
        require_home=True,
        require_terminal=True,
    )
    view: AuthSessionView = await service.get_session(
        SessionQueryInput(
            home_id=context.home_id,
            terminal_id=context.terminal_id,
        )
    )
    scope = ("api", "ws")
    access_token = access_token_resolver.issue(
        home_id=view.home_id,
        terminal_id=view.terminal_id,
        role="HOME_OWNER",
        scope=scope,
        subject=view.home_id,
    )
    access_token_claims = access_token_resolver.resolve(access_token)
    payload = asdict(view)
    payload.update(
        {
            "access_token": access_token,
            "access_token_expires_at": (
                access_token_claims.expires_at.isoformat()
                if access_token_claims is not None and access_token_claims.expires_at is not None
                else None
            ),
            "token_type": "Bearer",
            "scope": list(scope),
        }
    )
    return success_response(request, AuthSessionResponse.model_validate(payload))
