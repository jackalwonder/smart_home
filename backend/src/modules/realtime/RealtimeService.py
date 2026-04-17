from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from sqlalchemy import text
from starlette.websockets import WebSocketState

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import session_scope
from src.modules.realtime.RealtimeSchemas import (
    realtime_client_message_adapter,
    realtime_server_event_adapter,
)
from src.repositories.base.realtime.WsEventOutboxRepository import WsEventOutboxRepository
from src.shared.observability import get_observability_metrics, log_structured_event


def _parse_iso_datetime(value: str | None) -> datetime:
    if not value:
        return datetime.fromtimestamp(0, tz=timezone.utc)
    normalized = value.replace("Z", "+00:00")
    return datetime.fromisoformat(normalized)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class RealtimeConnectionState:
    home_id: str
    terminal_id: str
    sequence: int = 0
    sent_event_ids: set[str] = field(default_factory=set)
    pending_ack_ids: dict[str, str] = field(default_factory=dict)
    connected_at: str = field(default_factory=_now_iso)

    def next_sequence(self) -> int:
        self.sequence += 1
        return self.sequence


class RealtimeService:
    def __init__(
        self,
        ws_event_outbox_repository: WsEventOutboxRepository,
        database: Database | None = None,
    ) -> None:
        self._ws_event_outbox_repository = ws_event_outbox_repository
        self._database = database

    async def _touch_terminal(self, terminal_id: str, client_host: str | None) -> None:
        if self._database is None:
            return
        stmt = text(
            """
            UPDATE terminals
            SET last_seen_at = now(), last_ip = :client_host
            WHERE id = :terminal_id
            """
        )
        async with session_scope(self._database) as (session, owned):
            await session.execute(
                stmt,
                {"terminal_id": terminal_id, "client_host": client_host},
            )
            if owned:
                await session.commit()

    async def _send_event(self, websocket: WebSocket, state: RealtimeConnectionState, event) -> None:
        payload: dict[str, Any] = {
            "event_id": event.event_id,
            "event_type": event.event_type,
            "occurred_at": event.occurred_at,
            "sequence": state.next_sequence(),
            "home_id": event.home_id,
            "change_domain": event.change_domain,
            "snapshot_required": event.snapshot_required,
            "payload": event.payload_json,
        }
        normalized_event = realtime_server_event_adapter.validate_python(payload)
        await websocket.send_json(
            normalized_event.model_dump(mode="json")
        )
        get_observability_metrics().record_ws_event_sent(
            snapshot_required=event.snapshot_required
        )
        state.sent_event_ids.add(event.event_id)
        state.pending_ack_ids[event.event_id] = event.id

    async def _push_pending_once(
        self,
        websocket: WebSocket,
        state: RealtimeConnectionState,
    ) -> None:
        events = await self._ws_event_outbox_repository.list_recent(state.home_id, 100)
        for event in events:
            if event.event_id in state.sent_event_ids:
                continue
            if _parse_iso_datetime(event.occurred_at) < _parse_iso_datetime(state.connected_at):
                continue
            await self._send_event(websocket, state, event)

    async def _push_resume_backlog(
        self,
        websocket: WebSocket,
        state: RealtimeConnectionState,
        last_event_id: str | None,
    ) -> None:
        if last_event_id is None:
            get_observability_metrics().record_ws_resume("no_last_event_id")
            return
        events = await self._ws_event_outbox_repository.list_recent(state.home_id, 100)
        last_index = next((index for index, event in enumerate(events) if event.event_id == last_event_id), None)
        if last_index is None:
            get_observability_metrics().record_ws_resume("snapshot_fallback")
            log_structured_event(
                "websocket_resume",
                {
                    "home_id": state.home_id,
                    "terminal_id": state.terminal_id,
                    "last_event_id": last_event_id,
                    "result": "snapshot_fallback",
                },
            )
            synthetic_event = type(
                "SyntheticEvent",
                (),
                {
                    "id": "synthetic",
                    "event_id": "resume_required",
                    "event_type": "version_conflict_detected",
                    "occurred_at": _now_iso(),
                    "home_id": state.home_id,
                    "change_domain": "SUMMARY",
                    "snapshot_required": True,
                    "payload_json": {"reason": "EVENT_GAP", "last_event_id": last_event_id},
                },
            )()
            await self._send_event(websocket, state, synthetic_event)
            return
        get_observability_metrics().record_ws_resume("incremental_replay")
        log_structured_event(
            "websocket_resume",
            {
                "home_id": state.home_id,
                "terminal_id": state.terminal_id,
                "last_event_id": last_event_id,
                "result": "incremental_replay",
                "replay_count": len(events[last_index + 1 :]),
            },
        )
        for event in events[last_index + 1 :]:
            if event.event_id in state.sent_event_ids:
                continue
            await self._send_event(websocket, state, event)

    async def _sender_loop(
        self,
        websocket: WebSocket,
        state: RealtimeConnectionState,
        wakeup: asyncio.Event,
    ) -> None:
        while websocket.application_state == WebSocketState.CONNECTED:
            await self._push_pending_once(websocket, state)
            try:
                await asyncio.wait_for(wakeup.wait(), timeout=1.0)
                wakeup.clear()
            except asyncio.TimeoutError:
                continue

    async def handle_connection(
        self,
        websocket: WebSocket,
        home_id: str,
        terminal_id: str,
        last_event_id: str | None = None,
    ) -> None:
        await websocket.accept()
        await self._touch_terminal(terminal_id, websocket.client.host if websocket.client is not None else None)
        state = RealtimeConnectionState(
            home_id=home_id,
            terminal_id=terminal_id,
            connected_at="1970-01-01T00:00:00+00:00" if self._database is None else _now_iso(),
        )
        wakeup = asyncio.Event()
        await self._push_resume_backlog(websocket, state, last_event_id)
        sender_task = asyncio.create_task(self._sender_loop(websocket, state, wakeup))
        try:
            while True:
                raw_message = await websocket.receive_text()
                if raw_message == "poll":
                    wakeup.set()
                    continue
                try:
                    message = json.loads(raw_message)
                except json.JSONDecodeError:
                    continue
                if not isinstance(message, dict):
                    continue
                try:
                    client_message = realtime_client_message_adapter.validate_python(message)
                except ValidationError:
                    continue
                message_type = client_message.type
                if message_type == "ack":
                    event_id = client_message.event_id
                    if event_id in state.sent_event_ids:
                        row_id = state.pending_ack_ids.get(event_id)
                        if row_id is not None:
                            await self._ws_event_outbox_repository.mark_dispatched(row_id)
                        state.pending_ack_ids.pop(event_id, None)
                elif message_type == "resume":
                    await self._push_resume_backlog(websocket, state, client_message.last_event_id)
                elif message_type == "poll":
                    wakeup.set()
        except WebSocketDisconnect:
            return
        finally:
            sender_task.cancel()
            await asyncio.gather(sender_task, return_exceptions=True)
