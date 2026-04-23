from __future__ import annotations

from fastapi import APIRouter, Depends, Query, WebSocket

from src.app.container import get_realtime_service, get_request_context_service
from src.modules.auth.services.query.RequestContextService import RequestContextService
from src.modules.realtime.RealtimeService import RealtimeService
from src.shared.errors.AppError import AppError
from src.shared.observability import (
    collect_ws_legacy_context_fields,
    get_observability_metrics,
    log_structured_event,
)

router = APIRouter(tags=["realtime"])


def _select_websocket_subprotocol(websocket: WebSocket) -> str | None:
    raw_protocols = websocket.headers.get("sec-websocket-protocol")
    if raw_protocols is None:
        return None
    protocols = [part.strip().lower() for part in raw_protocols.split(",")]
    return "bearer" if "bearer" in protocols else None


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    last_event_id: str | None = Query(default=None),
    service: RealtimeService = Depends(get_realtime_service),
    request_context_service: RequestContextService = Depends(get_request_context_service),
) -> None:
    try:
        context = await request_context_service.resolve_websocket_request(
            websocket,
            require_home=True,
            require_terminal=True,
            require_session_auth=True,
        )
    except AppError as exc:
        legacy_context_fields = collect_ws_legacy_context_fields(
            query_params=websocket.query_params,
            headers=websocket.headers,
            cookies=websocket.cookies,
        )
        get_observability_metrics().record_ws_rejection(
            reason="auth_error",
            legacy_context_fields=legacy_context_fields,
        )
        log_structured_event(
            "websocket_rejected",
            {
                "reason": "auth_error",
                "error_code": str(exc.code),
                "legacy_context_fields": legacy_context_fields,
                "has_last_event_id": last_event_id is not None,
            },
        )
        await websocket.close(code=4401)
        return
    if context.auth_mode != "bearer":
        legacy_context_fields = collect_ws_legacy_context_fields(
            query_params=websocket.query_params,
            headers=websocket.headers,
            cookies=websocket.cookies,
        )
        get_observability_metrics().record_ws_rejection(
            reason="legacy_auth_mode",
            legacy_context_fields=legacy_context_fields,
        )
        log_structured_event(
            "websocket_rejected",
            {
                "reason": "legacy_auth_mode",
                "auth_mode": context.auth_mode,
                "home_id": context.home_id,
                "terminal_id": context.terminal_id,
                "operator_id": context.operator_id,
                "legacy_context_fields": legacy_context_fields,
                "has_last_event_id": last_event_id is not None,
            },
        )
        await websocket.close(code=4401)
        return
    legacy_context_fields = collect_ws_legacy_context_fields(
        query_params=websocket.query_params,
        headers=websocket.headers,
        cookies=websocket.cookies,
    )
    get_observability_metrics().record_ws_connection(
        auth_mode=context.auth_mode,
        legacy_context_fields=legacy_context_fields,
        has_last_event_id=last_event_id is not None,
    )
    log_structured_event(
        "websocket_connection",
        {
            "auth_mode": context.auth_mode,
            "home_id": context.home_id,
            "terminal_id": context.terminal_id,
            "operator_id": context.operator_id,
            "legacy_context_fields": legacy_context_fields,
            "has_last_event_id": last_event_id is not None,
        },
    )
    await service.handle_connection(
        websocket,
        context.home_id,
        context.terminal_id,
        last_event_id,
        subprotocol=_select_websocket_subprotocol(websocket),
    )
