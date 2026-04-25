from __future__ import annotations

from functools import lru_cache

from src.app.containers import core_container
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


def _database():
    return core_container.get_database()


@lru_cache(maxsize=1)
def get_editor_draft_query_repository() -> EditorDraftQueryRepositoryImpl:
    return EditorDraftQueryRepositoryImpl(_database())


@lru_cache(maxsize=1)
def get_editor_lease_query_repository() -> EditorLeaseQueryRepositoryImpl:
    return EditorLeaseQueryRepositoryImpl(_database())


@lru_cache(maxsize=1)
def get_draft_layout_repository() -> DraftLayoutRepositoryImpl:
    return DraftLayoutRepositoryImpl(_database())


@lru_cache(maxsize=1)
def get_draft_hotspot_repository() -> DraftHotspotRepositoryImpl:
    return DraftHotspotRepositoryImpl(_database())


@lru_cache(maxsize=1)
def get_draft_lease_repository() -> DraftLeaseRepositoryImpl:
    return DraftLeaseRepositoryImpl(_database())
