from __future__ import annotations

from injector import Module, provider, singleton

from src.infrastructure.db.connection.Database import Database
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


class EditorRepositoryModule(Module):
    @provider
    @singleton
    def provide_editor_draft_query_repository(
        self, db: Database
    ) -> EditorDraftQueryRepositoryImpl:
        return EditorDraftQueryRepositoryImpl(db)

    @provider
    @singleton
    def provide_editor_lease_query_repository(
        self, db: Database
    ) -> EditorLeaseQueryRepositoryImpl:
        return EditorLeaseQueryRepositoryImpl(db)

    @provider
    @singleton
    def provide_draft_layout_repository(
        self, db: Database
    ) -> DraftLayoutRepositoryImpl:
        return DraftLayoutRepositoryImpl(db)

    @provider
    @singleton
    def provide_draft_hotspot_repository(
        self, db: Database
    ) -> DraftHotspotRepositoryImpl:
        return DraftHotspotRepositoryImpl(db)

    @provider
    @singleton
    def provide_draft_lease_repository(
        self, db: Database
    ) -> DraftLeaseRepositoryImpl:
        return DraftLeaseRepositoryImpl(db)
