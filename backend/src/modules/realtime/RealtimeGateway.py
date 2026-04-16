from __future__ import annotations

from fastapi import APIRouter, Depends, Query, WebSocket

from src.app.container import get_realtime_service, get_request_context_service
from src.modules.auth.services.query.RequestContextService import RequestContextService
from src.modules.realtime.RealtimeService import RealtimeService
from src.shared.errors.AppError import AppError

router = APIRouter(tags=["realtime"])


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    home_id: str | None = Query(default=None, deprecated=True),
    terminal_id: str | None = Query(default=None, deprecated=True),
    access_token: str | None = Query(default=None),
    token: str | None = Query(default=None, deprecated=True),
    last_event_id: str | None = Query(default=None),
    service: RealtimeService = Depends(get_realtime_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> None:
    try:
        context = await request_context_service.resolve_websocket_request(
            websocket,
            explicit_home_id=home_id,
            explicit_terminal_id=terminal_id,
            explicit_token=access_token or token,
            require_home=True,
            require_terminal=True,
            require_session_auth=True,
        )
    except AppError:
        await websocket.close(code=4401)
        return
    await service.handle_connection(
        websocket,
        context.home_id,
        context.terminal_id,
        last_event_id,
    )
