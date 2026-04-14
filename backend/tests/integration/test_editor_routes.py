from __future__ import annotations

from src.app.container import (
    get_editor_draft_service,
    get_editor_publish_service,
    get_editor_session_service,
    get_request_context_service,
)
from src.modules.auth.services.query.RequestContextService import RequestContext
from src.modules.editor.services.EditorDraftService import EditorDraftSaveView, EditorDraftView
from src.modules.editor.services.EditorPublishService import EditorPublishView
from src.modules.editor.services.EditorSessionService import (
    EditorHeartbeatView,
    EditorSessionView,
)


class FakeEditorSessionService:
    async def open_session(self, _input):
        return EditorSessionView(
            granted=True,
            lock_status="GRANTED",
            lease_id="lease-1",
            lease_expires_at="2026-04-14T10:00:00+00:00",
            heartbeat_interval_seconds=20,
            locked_by=None,
            draft_version="dv_1",
            current_layout_version="lv_current",
        )

    async def heartbeat(self, _input):
        return EditorHeartbeatView(
            lease_id="lease-1",
            lease_expires_at="2026-04-14T10:00:00+00:00",
            lock_status="GRANTED",
        )


class FakeEditorDraftService:
    async def get_draft(self, _input):
        return EditorDraftView(
            draft_exists=True,
            draft_version="dv_1",
            base_layout_version="INITIAL",
            lock_status="GRANTED",
            layout={
                "background_image_url": None,
                "background_image_size": None,
                "hotspots": [
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
                "layout_meta": {"density": "comfortable"},
            },
            readonly=False,
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


class FakeRequestContextService:
    async def resolve_http_request(self, *_args, **_kwargs):
        return RequestContext(home_id="home-1", terminal_id="terminal-1", operator_id=None)


def test_open_and_get_editor_draft(app, client):
    app.dependency_overrides[get_editor_session_service] = lambda: FakeEditorSessionService()
    app.dependency_overrides[get_editor_draft_service] = lambda: FakeEditorDraftService()
    app.dependency_overrides[get_request_context_service] = lambda: FakeRequestContextService()

    open_response = client.post(
        "/api/v1/editor/sessions",
        json={"terminal_id": "terminal-1"},
    )
    draft_response = client.get("/api/v1/editor/draft", params={"lease_id": "lease-1"})

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
    app.dependency_overrides[get_request_context_service] = lambda: FakeRequestContextService()

    save_response = client.put(
        "/api/v1/editor/draft",
        json={
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
    app.dependency_overrides[get_request_context_service] = lambda: FakeRequestContextService()

    response = client.request(
        "DELETE",
        "/api/v1/editor/draft",
        json={
            "terminal_id": "terminal-1",
            "lease_id": "lease-1",
            "draft_version": "dv_1",
        },
    )

    assert response.status_code == 200
    assert response.json()["success"] is True
    assert response.json()["data"] == {"discarded": True, "lock_released": True}
