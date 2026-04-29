from __future__ import annotations

from src.app.container_getters._shared import resolve
from src.infrastructure.db.repositories.base.editor.DraftHotspotRepositoryImpl import (
    DraftHotspotRepositoryImpl,
)
from src.infrastructure.db.repositories.base.editor.DraftLayoutRepositoryImpl import (
    DraftLayoutRepositoryImpl,
)
from src.infrastructure.db.repositories.base.editor.DraftLeaseRepositoryImpl import (
    DraftLeaseRepositoryImpl,
)
from src.infrastructure.db.repositories.query.editor.EditorDraftQueryRepositoryImpl import (
    EditorDraftQueryRepositoryImpl,
)
from src.infrastructure.db.repositories.query.editor.EditorLeaseQueryRepositoryImpl import (
    EditorLeaseQueryRepositoryImpl,
)
from src.modules.editor.services.EditorDraftService import EditorDraftService
from src.modules.editor.services.EditorPublishService import EditorPublishService
from src.modules.editor.services.EditorSessionService import EditorSessionService


def get_editor_draft_query_repository() -> EditorDraftQueryRepositoryImpl:
    return resolve(EditorDraftQueryRepositoryImpl)


def get_editor_lease_query_repository() -> EditorLeaseQueryRepositoryImpl:
    return resolve(EditorLeaseQueryRepositoryImpl)


def get_draft_layout_repository() -> DraftLayoutRepositoryImpl:
    return resolve(DraftLayoutRepositoryImpl)


def get_draft_hotspot_repository() -> DraftHotspotRepositoryImpl:
    return resolve(DraftHotspotRepositoryImpl)


def get_draft_lease_repository() -> DraftLeaseRepositoryImpl:
    return resolve(DraftLeaseRepositoryImpl)


def get_editor_session_service() -> EditorSessionService:
    return resolve(EditorSessionService)


def get_editor_draft_service() -> EditorDraftService:
    return resolve(EditorDraftService)


def get_editor_publish_service() -> EditorPublishService:
    return resolve(EditorPublishService)


__all__ = [
    "get_draft_hotspot_repository",
    "get_draft_layout_repository",
    "get_draft_lease_repository",
    "get_editor_draft_query_repository",
    "get_editor_draft_service",
    "get_editor_lease_query_repository",
    "get_editor_publish_service",
    "get_editor_session_service",
]

