from __future__ import annotations

from fastapi import APIRouter, Depends, Query, WebSocket

from src.app.container import get_realtime_service
from src.modules.realtime.RealtimeService import RealtimeService

router = APIRouter(tags=["realtime"])


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    home_id: str = Query(...),
    terminal_id: str | None = Query(default=None),
    last_event_id: str | None = Query(default=None),
    service: RealtimeService = Depends(get_realtime_service),
) -> None:
    await service.handle_connection(websocket, home_id, terminal_id, last_event_id)
