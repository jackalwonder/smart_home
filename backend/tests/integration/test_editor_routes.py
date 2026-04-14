from __future__ import annotations

from src.app.container import (
    get_editor_draft_service,
    get_editor_publish_service,
    get_editor_session_service,
)
from src.modules.editor.services.EditorDraftService import EditorDraftSaveView
from src.modules.editor.services.EditorPublishService import EditorPublishView
from src.modules.editor.services.EditorSessionService import EditorSessionView
from src.repositories.read_models.index import DraftLeaseReadModel, EditorDraftReadModel


class FakeEditorSessionService:
    async def open_session(self, _input):
        return EditorSessionView(
            granted=True,
            lock_status="GRANTED",
            lease_id="lease-1",
            lease_expires_at="2026-04-14T10:00:00+00:00",
            heartbeat_interval_seconds=10,
            locked_by="terminal-1",
            draft_version="dv_1",
            current_layout_version="lv_current",
        )

    async def heartbeat(self, _input):
        from src.modules.editor.services.EditorSessionService import EditorHeartbeatView

        return EditorHeartbeatView(
            lease_id="lease-1",
            lease_expires_at="2026-04-14T10:00:00+00:00",
            lock_status="GRANTED",
        )


class FakeEditorDraftService:
    async def get_draft(self, _input):
        return EditorDraftReadModel(
            draft_id="draft-1",
            home_id="home-1",
            draft_version="dv_1",
            base_layout_version="INITIAL",
            background_asset_id=None,
            layout_meta={"density": "comfortable"},
            hotspots=[
                {
                    "hotspot_id": "hs-1",
                    "device_id": "device-1",
                    "x": 0.5,
                    "y": 0.5,
                    "is_visible": True,
                    "structure_order": 0,
                    "icon_type": None,
                    "label_mode": None,
                }
            ],
            active_lease=DraftLeaseReadModel(
                lease_id="lease-1",
                terminal_id="terminal-1",
                member_id=None,
                lease_status="ACTIVE",
                is_active=True,
                lease_expires_at="2026-04-14T10:00:00+00:00",
                last_heartbeat_at="2026-04-14T09:59:30+00:00",
            ),
        )

    async def save_draft(self, _input):
        return EditorDraftSaveView(
            saved_to_draft=True,
            draft_version="dv_2",
            preview_only=False,
            lock_status="GRANTED",
        )

    async def discard_draft(self, _input):
        return {"discarded": True, "lock_released": True}


class FakeEditorPublishService:
    async def publish(self, _input):
        return EditorPublishView(
            published=True,
            layout_version="lv_1",
            effective_at="2026-04-14T10:05:00Z",
            lock_released=True,
        )


def test_open_and_get_editor_draft(app, client):
    app.dependency_overrides[get_editor_session_service] = lambda: FakeEditorSessionService()
    app.dependency_overrides[get_editor_draft_service] = lambda: FakeEditorDraftService()

    open_response = client.post(
        "/api/v1/editor/sessions",
        json={"home_id": "home-1", "terminal_id": "terminal-1"},
    )
    draft_response = client.get("/api/v1/editor/draft", params={"home_id": "home-1"})

    assert open_response.status_code == 200
    assert open_response.json()["success"] is True
    assert open_response.json()["data"]["lease_id"] == "lease-1"
    assert open_response.json()["data"]["granted"] is True
    assert draft_response.status_code == 200
    assert draft_response.json()["success"] is True
    assert draft_response.json()["data"]["draft_version"] == "dv_1"
    assert draft_response.json()["data"]["draft_exists"] is True
    assert draft_response.json()["data"]["layout"]["hotspots"][0]["hotspot_id"] == "hs-1"


def test_save_and_publish_editor_draft(app, client):
    app.dependency_overrides[get_editor_draft_service] = lambda: FakeEditorDraftService()
    app.dependency_overrides[get_editor_publish_service] = lambda: FakeEditorPublishService()

    save_response = client.put(
        "/api/v1/editor/draft",
        json={
            "home_id": "home-1",
            "terminal_id": "terminal-1",
            "lease_id": "lease-1",
            "draft_version": "dv_1",
            "base_layout_version": "INITIAL",
            "background_asset_id": None,
            "layout_meta": {},
            "hotspots": [],
        },
    )
    publish_response = client.post(
        "/api/v1/editor/publish",
        json={
            "home_id": "home-1",
            "terminal_id": "terminal-1",
            "lease_id": "lease-1",
            "draft_version": "dv_2",
            "base_layout_version": "INITIAL",
        },
    )

    assert save_response.status_code == 200
    assert save_response.json()["success"] is True
    assert save_response.json()["data"]["saved_to_draft"] is True
    assert save_response.json()["data"]["draft_version"] == "dv_2"
    assert publish_response.status_code == 200
    assert publish_response.json()["success"] is True
    assert publish_response.json()["data"]["published"] is True
    assert publish_response.json()["data"]["layout_version"] == "lv_1"


def test_delete_editor_draft(app, client):
    app.dependency_overrides[get_editor_draft_service] = lambda: FakeEditorDraftService()

    response = client.request(
        "DELETE",
        "/api/v1/editor/draft",
        json={
            "home_id": "home-1",
            "terminal_id": "terminal-1",
            "lease_id": "lease-1",
            "draft_version": "dv_1",
        },
    )

    assert response.status_code == 200
    assert response.json()["success"] is True
    assert response.json()["data"] == {"discarded": True, "lock_released": True}
