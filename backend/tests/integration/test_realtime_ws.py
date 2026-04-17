from __future__ import annotations

import pytest

from src.app.container import get_request_context_service
from src.app.container import get_realtime_service
from src.modules.auth.services.query.RequestContextService import RequestContext
from src.modules.realtime.RealtimeService import RealtimeService
from src.repositories.rows.index import WsEventOutboxRow
from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode
from src.shared.observability import get_observability_metrics
from starlette.websockets import WebSocketDisconnect


class _FakeOutboxRepo:
    def __init__(self) -> None:
        self.events = [
            WsEventOutboxRow(
                id="1",
                home_id="home-1",
                event_id="evt-1",
                event_type="settings_updated",
                change_domain="SETTINGS",
                snapshot_required=True,
                payload_json={
                    "settings_version": "sv_1",
                    "updated_domains": ["FAVORITES", "PAGE_SETTINGS", "FUNCTION_SETTINGS"],
                    "effective_at": "2026-04-14T10:00:00+00:00",
                },
                delivery_status="PENDING",
                occurred_at="2026-04-14T10:00:00+00:00",
                created_at="2026-04-14T10:00:00+00:00",
            ),
            WsEventOutboxRow(
                id="2",
                home_id="home-1",
                event_id="evt-2",
                event_type="summary_updated",
                change_domain="SUMMARY",
                snapshot_required=False,
                payload_json={
                    "room_count": 1,
                    "entity_count": 4,
                    "device_count": 2,
                    "linked_entity_count": 4,
                },
                delivery_status="PENDING",
                occurred_at="2026-04-14T10:00:01+00:00",
                created_at="2026-04-14T10:00:01+00:00",
            ),
        ]
        self.dispatched: list[str] = []

    async def insert(self, input, ctx=None):  # pragma: no cover - not used in test
        raise NotImplementedError

    async def list_pending(self, limit: int, ctx=None):
        return [event for event in self.events if event.event_id not in self.dispatched][:limit]

    async def list_recent(self, home_id: str, limit: int, ctx=None):
        return [event for event in self.events if event.home_id == home_id][:limit]

    async def mark_dispatching(self, ids, ctx=None):  # pragma: no cover - not used in test
        return None

    async def mark_dispatched(self, id: str, ctx=None):
        self.dispatched.append(id)

    async def mark_failed(self, id: str, ctx=None):  # pragma: no cover - not used in test
        return None


class _StrictFakeRequestContextService:
    async def resolve_websocket_request(self, websocket, **kwargs):
        token = (
            kwargs.get("explicit_token")
            or websocket.query_params.get("access_token")
            or websocket.query_params.get("token")
            or websocket.cookies.get("pin_session_token")
        )
        if kwargs.get("require_session_auth") and not token:
            raise AppError(ErrorCode.UNAUTHORIZED, "session authentication is required")
        if websocket.query_params.get("home_id") not in {None, "home-1"}:
            raise AppError(ErrorCode.UNAUTHORIZED, "context mismatch")
        if websocket.query_params.get("terminal_id") not in {None, "terminal-1"}:
            raise AppError(ErrorCode.UNAUTHORIZED, "context mismatch")
        return RequestContext(
            home_id="home-1",
            terminal_id="terminal-1",
            session_token=None if websocket.query_params.get("access_token") else token,
            auth_mode="bearer" if websocket.query_params.get("access_token") else "legacy_pin_session",
        )


def test_websocket_pushes_sequence_and_ack_dispatches(app, client):
    repo = _FakeOutboxRepo()
    app.dependency_overrides[get_realtime_service] = lambda: RealtimeService(repo)
    app.dependency_overrides[get_request_context_service] = lambda: _StrictFakeRequestContextService()

    with client.websocket_connect("/ws?access_token=test-access-token") as websocket:
        first = websocket.receive_json()
        second = websocket.receive_json()
        websocket.send_json({"type": "ack", "event_id": "evt-1"})
        websocket.send_json({"type": "ack", "event_id": "evt-2"})

    assert first["event_id"] == "evt-1"
    assert first["sequence"] == 1
    assert first["home_id"] == "home-1"
    assert first["change_domain"] == "SETTINGS"
    assert first["snapshot_required"] is True
    assert second["event_id"] == "evt-2"
    assert second["sequence"] == 2
    assert repo.dispatched == ["1", "2"]
    snapshot = get_observability_metrics().snapshot()
    assert snapshot["websocket"]["connections_total"] == 1
    assert snapshot["websocket"]["auth_mode_counts"]["bearer"] == 1
    assert snapshot["websocket"]["events_sent_total"] == 2
    assert snapshot["websocket"]["snapshot_required_events_total"] == 1


def test_websocket_resume_gap_requests_snapshot(app, client):
    repo = _FakeOutboxRepo()
    app.dependency_overrides[get_realtime_service] = lambda: RealtimeService(repo)
    app.dependency_overrides[get_request_context_service] = lambda: _StrictFakeRequestContextService()

    with client.websocket_connect(
        "/ws?access_token=test-access-token&last_event_id=evt-missing"
    ) as websocket:
        event = websocket.receive_json()

    assert event["event_type"] == "version_conflict_detected"
    assert event["snapshot_required"] is True
    assert event["payload"]["reason"] == "EVENT_GAP"
    snapshot = get_observability_metrics().snapshot()
    assert snapshot["websocket"]["resume_counts"]["snapshot_fallback"] == 1


def test_websocket_resume_replays_events_after_last_event_id(app, client):
    repo = _FakeOutboxRepo()
    app.dependency_overrides[get_realtime_service] = lambda: RealtimeService(repo)
    app.dependency_overrides[get_request_context_service] = lambda: _StrictFakeRequestContextService()

    with client.websocket_connect(
        "/ws?access_token=test-access-token&last_event_id=evt-1"
    ) as websocket:
        event = websocket.receive_json()

    assert event["event_id"] == "evt-2"
    assert event["sequence"] == 1
    assert event["snapshot_required"] is False
    snapshot = get_observability_metrics().snapshot()
    assert snapshot["websocket"]["resume_counts"]["incremental_replay"] == 1


def test_websocket_rejects_connection_without_token_or_session_state(app, client):
    repo = _FakeOutboxRepo()
    app.dependency_overrides[get_realtime_service] = lambda: RealtimeService(repo)
    app.dependency_overrides[get_request_context_service] = lambda: _StrictFakeRequestContextService()

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/ws"):
            pass

    assert exc_info.value.code == 4401
    snapshot = get_observability_metrics().snapshot()
    assert snapshot["websocket"]["rejected_total"] == 1
    assert snapshot["websocket"]["rejected_reason_counts"]["auth_error"] == 1


def test_websocket_rejects_cookie_backed_session_state(app, client):
    repo = _FakeOutboxRepo()
    app.dependency_overrides[get_realtime_service] = lambda: RealtimeService(repo)
    app.dependency_overrides[get_request_context_service] = lambda: _StrictFakeRequestContextService()
    client.cookies.set("pin_session_token", "pin-session-cookie")

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/ws"):
            pass

    assert exc_info.value.code == 4401
    snapshot = get_observability_metrics().snapshot()
    assert snapshot["websocket"]["rejected_total"] == 1
    assert snapshot["websocket"]["rejected_reason_counts"]["legacy_auth_mode"] == 1
    assert (
        snapshot["websocket"]["rejected_legacy_context_field_counts"]["cookie.pin_session_token"]
        == 1
    )


def test_websocket_rejects_legacy_token_query(app, client):
    repo = _FakeOutboxRepo()
    app.dependency_overrides[get_realtime_service] = lambda: RealtimeService(repo)
    app.dependency_overrides[get_request_context_service] = lambda: _StrictFakeRequestContextService()

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/ws?token=legacy-session-token"):
            pass

    assert exc_info.value.code == 4401
    snapshot = get_observability_metrics().snapshot()
    assert snapshot["websocket"]["rejected_total"] == 1
    assert snapshot["websocket"]["rejected_reason_counts"]["legacy_auth_mode"] == 1
    assert snapshot["websocket"]["rejected_legacy_context_field_counts"]["query.token"] == 1
