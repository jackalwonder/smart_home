from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from src.app.container import get_session_query_service
from src.modules.auth.services.query.SessionQueryService import (
    AuthSessionView,
    SessionQueryInput,
    SessionQueryService,
)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class AuthSessionResponse(BaseModel):
    home_id: str
    terminal_id: str
    terminal_mode: str
    login_mode: str
    pin_session_active: bool
    features: dict[str, bool]
@router.get("/session", response_model=AuthSessionResponse)
async def get_auth_session(
    home_id: str = Query(...),
    terminal_id: str = Query(...),
    service: SessionQueryService = Depends(get_session_query_service),
) -> AuthSessionResponse:
    view: AuthSessionView = await service.get_session(
        SessionQueryInput(home_id=home_id, terminal_id=terminal_id)
    )
    return AuthSessionResponse.model_validate(asdict(view))
