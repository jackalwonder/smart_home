from __future__ import annotations

from src.app.container import get_realtime_service
from src.modules.realtime.RealtimeService import RealtimeService
from src.repositories.rows.index import WsEventOutboxRow


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
                payload_json={"settings_version": "sv_1"},
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
                payload_json={"home_id": "home-1"},
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


def test_websocket_pushes_sequence_and_ack_dispatches(app, client):
    repo = _FakeOutboxRepo()
    app.dependency_overrides[get_realtime_service] = lambda: RealtimeService(repo)

    with client.websocket_connect("/ws?home_id=home-1&terminal_id=terminal-1") as websocket:
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


def test_websocket_resume_gap_requests_snapshot(app, client):
    repo = _FakeOutboxRepo()
    app.dependency_overrides[get_realtime_service] = lambda: RealtimeService(repo)

    with client.websocket_connect(
        "/ws?home_id=home-1&terminal_id=terminal-1&last_event_id=evt-missing"
    ) as websocket:
        event = websocket.receive_json()

    assert event["event_type"] == "version_conflict_detected"
    assert event["snapshot_required"] is True
    assert event["payload"]["reason"] == "EVENT_GAP"
