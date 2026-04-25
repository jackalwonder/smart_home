from __future__ import annotations

from functools import lru_cache

from src.modules.editor.services.EditorDraftService import EditorDraftService
from src.modules.editor.services.EditorPublishService import EditorPublishService
from src.modules.editor.services.EditorSessionService import EditorSessionService


def _root():
    from src.app import container

    return container


@lru_cache(maxsize=1)
def get_editor_session_service() -> EditorSessionService:
    root = _root()
    return EditorSessionService(
        unit_of_work=root.get_unit_of_work(),
        editor_lease_query_repository=root.get_editor_lease_query_repository(),
        draft_lease_repository=root.get_draft_lease_repository(),
        draft_layout_repository=root.get_draft_layout_repository(),
        draft_hotspot_repository=root.get_draft_hotspot_repository(),
        layout_version_repository=root.get_layout_version_repository(),
        layout_hotspot_repository=root.get_layout_hotspot_repository(),
        ws_event_outbox_repository=root.get_ws_event_outbox_repository(),
        management_pin_guard=root.get_management_pin_guard(),
        id_generator=root.get_id_generator(),
        version_token_generator=root.get_version_token_generator(),
        event_id_generator=root.get_event_id_generator(),
        clock=root.get_clock(),
    )


@lru_cache(maxsize=1)
def get_editor_draft_service() -> EditorDraftService:
    root = _root()
    return EditorDraftService(
        unit_of_work=root.get_unit_of_work(),
        editor_draft_query_repository=root.get_editor_draft_query_repository(),
        draft_layout_repository=root.get_draft_layout_repository(),
        draft_hotspot_repository=root.get_draft_hotspot_repository(),
        draft_lease_repository=root.get_draft_lease_repository(),
        layout_version_repository=root.get_layout_version_repository(),
        layout_hotspot_repository=root.get_layout_hotspot_repository(),
        management_pin_guard=root.get_management_pin_guard(),
        version_token_generator=root.get_version_token_generator(),
        clock=root.get_clock(),
    )


@lru_cache(maxsize=1)
def get_editor_publish_service() -> EditorPublishService:
    root = _root()
    return EditorPublishService(
        unit_of_work=root.get_unit_of_work(),
        draft_layout_repository=root.get_draft_layout_repository(),
        draft_hotspot_repository=root.get_draft_hotspot_repository(),
        draft_lease_repository=root.get_draft_lease_repository(),
        layout_version_repository=root.get_layout_version_repository(),
        layout_hotspot_repository=root.get_layout_hotspot_repository(),
        ws_event_outbox_repository=root.get_ws_event_outbox_repository(),
        management_pin_guard=root.get_management_pin_guard(),
        version_token_generator=root.get_version_token_generator(),
        event_id_generator=root.get_event_id_generator(),
        clock=root.get_clock(),
    )
