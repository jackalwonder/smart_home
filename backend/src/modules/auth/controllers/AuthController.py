from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel

from src.app.container import get_session_query_service
from src.modules.auth.services.query.SessionQueryService import (
    AuthSessionView,
    SessionQueryInput,
    SessionQueryService,
)
from src.shared.http.ResponseEnvelope import success_response

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class AuthSessionResponse(BaseModel):
    home_id: str
    operator_id: str | None = None
    terminal_id: str
    terminal_mode: str
    login_mode: str
    pin_session_active: bool
    pin_session_expires_at: str | None = None
    features: dict[str, bool]


@router.get("/session")
async def get_auth_session(
    request: Request,
    home_id: str = Query(...),
    terminal_id: str = Query(...),
    service: SessionQueryService = Depends(get_session_query_service),
) -> object:
    view: AuthSessionView = await service.get_session(
        SessionQueryInput(home_id=home_id, terminal_id=terminal_id)
    )
    return success_response(request, AuthSessionResponse.model_validate(asdict(view)))
