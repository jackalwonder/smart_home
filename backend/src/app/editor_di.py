from __future__ import annotations

from injector import Module, provider, singleton

from src.shared.kernel.implementations import SystemClock, UuidEventIdGenerator, UuidIdGenerator
from src.shared.kernel.implementations import TimestampVersionTokenGenerator
from src.modules.auth.services.guard.ManagementPinGuard import ManagementPinGuard
from src.modules.editor.services.EditorDraftConflictDetails import EditorDraftConflictDetails
from src.modules.editor.services.EditorDraftDiffBuilder import EditorDraftDiffBuilder
from src.modules.editor.services.EditorDraftService import EditorDraftService
from src.modules.editor.services.EditorPublishService import EditorPublishService
from src.modules.editor.services.EditorSessionService import EditorSessionService
from src.infrastructure.db.repositories.query.editor.EditorDraftQueryRepositoryImpl import (
    EditorDraftQueryRepositoryImpl,
)
from src.infrastructure.db.repositories.query.editor.EditorLeaseQueryRepositoryImpl import (
    EditorLeaseQueryRepositoryImpl,
)
from src.infrastructure.db.repositories.base.editor.DraftLayoutRepositoryImpl import (
    DraftLayoutRepositoryImpl,
)
from src.infrastructure.db.repositories.base.editor.DraftHotspotRepositoryImpl import (
    DraftHotspotRepositoryImpl,
)
from src.infrastructure.db.repositories.base.editor.DraftLeaseRepositoryImpl import (
    DraftLeaseRepositoryImpl,
)
from src.infrastructure.db.repositories.base.settings.LayoutVersionRepositoryImpl import (
    LayoutVersionRepositoryImpl,
)
from src.infrastructure.db.repositories.base.settings.LayoutHotspotRepositoryImpl import (
    LayoutHotspotRepositoryImpl,
)
from src.infrastructure.db.repositories.base.realtime.WsEventOutboxRepositoryImpl import (
    WsEventOutboxRepositoryImpl,
)
from src.infrastructure.db.unit_of_work.PostgresUnitOfWork import PostgresUnitOfWork


class EditorModule(Module):
    @provider
    @singleton
    def provide_editor_draft_diff_builder(self) -> EditorDraftDiffBuilder:
        return EditorDraftDiffBuilder()

    @provider
    @singleton
    def provide_editor_draft_conflict_details(self) -> EditorDraftConflictDetails:
        return EditorDraftConflictDetails()

    @provider
    @singleton
    def provide_editor_session_service(
        self,
        unit_of_work: PostgresUnitOfWork,
        editor_lease_query_repository: EditorLeaseQueryRepositoryImpl,
        draft_lease_repository: DraftLeaseRepositoryImpl,
        draft_layout_repository: DraftLayoutRepositoryImpl,
        draft_hotspot_repository: DraftHotspotRepositoryImpl,
        layout_version_repository: LayoutVersionRepositoryImpl,
        layout_hotspot_repository: LayoutHotspotRepositoryImpl,
        ws_event_outbox_repository: WsEventOutboxRepositoryImpl,
        management_pin_guard: ManagementPinGuard,
        id_generator: UuidIdGenerator,
        version_token_generator: TimestampVersionTokenGenerator,
        event_id_generator: UuidEventIdGenerator,
        clock: SystemClock,
    ) -> EditorSessionService:
        return EditorSessionService(
            unit_of_work=unit_of_work,
            editor_lease_query_repository=editor_lease_query_repository,
            draft_lease_repository=draft_lease_repository,
            draft_layout_repository=draft_layout_repository,
            draft_hotspot_repository=draft_hotspot_repository,
            layout_version_repository=layout_version_repository,
            layout_hotspot_repository=layout_hotspot_repository,
            ws_event_outbox_repository=ws_event_outbox_repository,
            management_pin_guard=management_pin_guard,
            id_generator=id_generator,
            version_token_generator=version_token_generator,
            event_id_generator=event_id_generator,
            clock=clock,
        )

    @provider
    @singleton
    def provide_editor_draft_service(
        self,
        unit_of_work: PostgresUnitOfWork,
        editor_draft_query_repository: EditorDraftQueryRepositoryImpl,
        draft_layout_repository: DraftLayoutRepositoryImpl,
        draft_hotspot_repository: DraftHotspotRepositoryImpl,
        draft_lease_repository: DraftLeaseRepositoryImpl,
        layout_version_repository: LayoutVersionRepositoryImpl,
        layout_hotspot_repository: LayoutHotspotRepositoryImpl,
        management_pin_guard: ManagementPinGuard,
        version_token_generator: TimestampVersionTokenGenerator,
        clock: SystemClock,
        diff_builder: EditorDraftDiffBuilder,
        conflict_details: EditorDraftConflictDetails,
    ) -> EditorDraftService:
        return EditorDraftService(
            unit_of_work=unit_of_work,
            editor_draft_query_repository=editor_draft_query_repository,
            draft_layout_repository=draft_layout_repository,
            draft_hotspot_repository=draft_hotspot_repository,
            draft_lease_repository=draft_lease_repository,
            layout_version_repository=layout_version_repository,
            layout_hotspot_repository=layout_hotspot_repository,
            management_pin_guard=management_pin_guard,
            version_token_generator=version_token_generator,
            clock=clock,
            diff_builder=diff_builder,
            conflict_details=conflict_details,
        )

    @provider
    @singleton
    def provide_editor_publish_service(
        self,
        unit_of_work: PostgresUnitOfWork,
        draft_layout_repository: DraftLayoutRepositoryImpl,
        draft_hotspot_repository: DraftHotspotRepositoryImpl,
        draft_lease_repository: DraftLeaseRepositoryImpl,
        layout_version_repository: LayoutVersionRepositoryImpl,
        layout_hotspot_repository: LayoutHotspotRepositoryImpl,
        ws_event_outbox_repository: WsEventOutboxRepositoryImpl,
        management_pin_guard: ManagementPinGuard,
        version_token_generator: TimestampVersionTokenGenerator,
        event_id_generator: UuidEventIdGenerator,
        clock: SystemClock,
    ) -> EditorPublishService:
        return EditorPublishService(
            unit_of_work=unit_of_work,
            draft_layout_repository=draft_layout_repository,
            draft_hotspot_repository=draft_hotspot_repository,
            draft_lease_repository=draft_lease_repository,
            layout_version_repository=layout_version_repository,
            layout_hotspot_repository=layout_hotspot_repository,
            ws_event_outbox_repository=ws_event_outbox_repository,
            management_pin_guard=management_pin_guard,
            version_token_generator=version_token_generator,
            event_id_generator=event_id_generator,
            clock=clock,
        )
