from __future__ import annotations

from functools import lru_cache

from src.app.containers import auth_container, core_container, repositories_container
from src.modules.editor.services.EditorDraftService import EditorDraftService
from src.modules.editor.services.EditorPublishService import EditorPublishService
from src.modules.editor.services.EditorSessionService import EditorSessionService


@lru_cache(maxsize=1)
def get_editor_session_service() -> EditorSessionService:
    return EditorSessionService(
        unit_of_work=repositories_container.get_unit_of_work(),
        editor_lease_query_repository=repositories_container.get_editor_lease_query_repository(),
        draft_lease_repository=repositories_container.get_draft_lease_repository(),
        draft_layout_repository=repositories_container.get_draft_layout_repository(),
        draft_hotspot_repository=repositories_container.get_draft_hotspot_repository(),
        layout_version_repository=repositories_container.get_layout_version_repository(),
        layout_hotspot_repository=repositories_container.get_layout_hotspot_repository(),
        ws_event_outbox_repository=repositories_container.get_ws_event_outbox_repository(),
        management_pin_guard=auth_container.get_management_pin_guard(),
        id_generator=core_container.get_id_generator(),
        version_token_generator=core_container.get_version_token_generator(),
        event_id_generator=core_container.get_event_id_generator(),
        clock=core_container.get_clock(),
    )


@lru_cache(maxsize=1)
def get_editor_draft_service() -> EditorDraftService:
    return EditorDraftService(
        unit_of_work=repositories_container.get_unit_of_work(),
        editor_draft_query_repository=repositories_container.get_editor_draft_query_repository(),
        draft_layout_repository=repositories_container.get_draft_layout_repository(),
        draft_hotspot_repository=repositories_container.get_draft_hotspot_repository(),
        draft_lease_repository=repositories_container.get_draft_lease_repository(),
        layout_version_repository=repositories_container.get_layout_version_repository(),
        layout_hotspot_repository=repositories_container.get_layout_hotspot_repository(),
        management_pin_guard=auth_container.get_management_pin_guard(),
        version_token_generator=core_container.get_version_token_generator(),
        clock=core_container.get_clock(),
    )


@lru_cache(maxsize=1)
def get_editor_publish_service() -> EditorPublishService:
    return EditorPublishService(
        unit_of_work=repositories_container.get_unit_of_work(),
        draft_layout_repository=repositories_container.get_draft_layout_repository(),
        draft_hotspot_repository=repositories_container.get_draft_hotspot_repository(),
        draft_lease_repository=repositories_container.get_draft_lease_repository(),
        layout_version_repository=repositories_container.get_layout_version_repository(),
        layout_hotspot_repository=repositories_container.get_layout_hotspot_repository(),
        ws_event_outbox_repository=repositories_container.get_ws_event_outbox_repository(),
        management_pin_guard=auth_container.get_management_pin_guard(),
        version_token_generator=core_container.get_version_token_generator(),
        event_id_generator=core_container.get_event_id_generator(),
        clock=core_container.get_clock(),
    )
