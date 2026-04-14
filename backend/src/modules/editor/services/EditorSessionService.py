from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from src.repositories.base.editor.DraftHotspotRepository import (
    DraftHotspotRepository,
    DraftHotspotSnapshotRow,
)
from src.repositories.base.editor.DraftLayoutRepository import (
    DraftLayoutRepository,
    DraftLayoutUpsertRow,
)
from src.repositories.base.editor.DraftLeaseRepository import DraftLeaseRepository, NewDraftLeaseRow
from src.repositories.base.realtime.WsEventOutboxRepository import NewWsEventOutboxRow, WsEventOutboxRepository
from src.repositories.base.settings.LayoutHotspotRepository import LayoutHotspotRepository
from src.repositories.base.settings.LayoutVersionRepository import LayoutVersionRepository
from src.repositories.query.editor.EditorLeaseQueryRepository import (
    EditorLeaseContextReadModel,
    EditorLeaseQueryRepository,
)
from src.modules.auth.services.guard.ManagementPinGuard import ManagementPinGuard
from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode
from src.shared.kernel.Clock import Clock
from src.shared.kernel.EventIdGenerator import EventIdGenerator
from src.shared.kernel.IdGenerator import IdGenerator
from src.shared.kernel.RepoContext import RepoContext
from src.shared.kernel.UnitOfWork import UnitOfWork
from src.shared.kernel.VersionTokenGenerator import VersionTokenGenerator


@dataclass(frozen=True)
class EditorSessionInput:
    home_id: str
    terminal_id: str
    takeover_if_locked: bool = False
    member_id: str | None = None


@dataclass(frozen=True)
class EditorSessionView:
    granted: bool
    lock_status: str
    lease_id: str | None
    lease_expires_at: str | None
    heartbeat_interval_seconds: int | None
    locked_by: str | None
    draft_version: str | None
    current_layout_version: str | None


@dataclass(frozen=True)
class EditorHeartbeatView:
    lease_id: str
    lease_expires_at: str
    lock_status: str


@dataclass(frozen=True)
class EditorHeartbeatInput:
    home_id: str
    terminal_id: str
    lease_id: str


class EditorSessionService:
    def __init__(
        self,
        unit_of_work: UnitOfWork,
        editor_lease_query_repository: EditorLeaseQueryRepository,
        draft_lease_repository: DraftLeaseRepository,
        draft_layout_repository: DraftLayoutRepository,
        draft_hotspot_repository: DraftHotspotRepository,
        layout_version_repository: LayoutVersionRepository,
        layout_hotspot_repository: LayoutHotspotRepository,
        ws_event_outbox_repository: WsEventOutboxRepository,
        management_pin_guard: ManagementPinGuard,
        id_generator: IdGenerator,
        version_token_generator: VersionTokenGenerator,
        event_id_generator: EventIdGenerator,
        clock: Clock,
    ) -> None:
        self._unit_of_work = unit_of_work
        self._editor_lease_query_repository = editor_lease_query_repository
        self._draft_lease_repository = draft_lease_repository
        self._draft_layout_repository = draft_layout_repository
        self._draft_hotspot_repository = draft_hotspot_repository
        self._layout_version_repository = layout_version_repository
        self._layout_hotspot_repository = layout_hotspot_repository
        self._ws_event_outbox_repository = ws_event_outbox_repository
        self._management_pin_guard = management_pin_guard
        self._id_generator = id_generator
        self._version_token_generator = version_token_generator
        self._event_id_generator = event_id_generator
        self._clock = clock

    async def open_session(self, input: EditorSessionInput) -> EditorSessionView:
        await self._management_pin_guard.require_active_session(input.home_id, input.terminal_id)
        now = self._clock.now()
        current_layout = await self._layout_version_repository.find_current_by_home(input.home_id)
        lease_context: EditorLeaseContextReadModel = await self._editor_lease_query_repository.get_lease_context(
            input.home_id,
            input.terminal_id,
            now,
        )
        active_lease = lease_context.active_lease
        draft = await self._draft_layout_repository.find_by_home_id(input.home_id)
        if active_lease is not None and active_lease.terminal_id == input.terminal_id:
            return EditorSessionView(
                granted=True,
                lock_status="GRANTED",
                lease_id=active_lease.lease_id,
                lease_expires_at=active_lease.lease_expires_at,
                heartbeat_interval_seconds=10,
                locked_by=input.terminal_id,
                draft_version=draft.draft_version if draft is not None else None,
                current_layout_version=(
                    draft.base_layout_version
                    if draft is not None
                    else current_layout.layout_version if current_layout is not None else None
                ),
            )
        if active_lease is not None and active_lease.terminal_id != input.terminal_id and not input.takeover_if_locked:
            return EditorSessionView(
                granted=False,
                lock_status="LOCKED_BY_OTHER",
                lease_id=active_lease.lease_id,
                lease_expires_at=active_lease.lease_expires_at,
                heartbeat_interval_seconds=10,
                locked_by=active_lease.terminal_id,
                draft_version=draft.draft_version if draft is not None else None,
                current_layout_version=(
                    draft.base_layout_version
                    if draft is not None
                    else current_layout.layout_version if current_layout is not None else None
                ),
            )

        async def _transaction(tx) -> EditorSessionView:
            ctx = RepoContext(tx=tx)
            takeover_from = None
            if active_lease is not None:
                takeover_from = active_lease.lease_id
                await self._draft_lease_repository.deactivate_lease(
                    active_lease.lease_id,
                    "TAKEN_OVER" if active_lease.terminal_id != input.terminal_id else "RELEASED",
                    "TAKEN_OVER" if active_lease.terminal_id != input.terminal_id else None,
                    ctx=ctx,
                )
            lease_id = self._id_generator.next_id()
            heartbeat_at = now.isoformat()
            lease_expires_at = (now + timedelta(seconds=30)).isoformat()
            inserted_lease = await self._draft_lease_repository.insert(
                NewDraftLeaseRow(
                    home_id=input.home_id,
                    lease_id=lease_id,
                    terminal_id=input.terminal_id,
                    member_id=input.member_id,
                    lease_status="ACTIVE",
                    is_active=True,
                    lease_expires_at=lease_expires_at,
                    heartbeat_interval_seconds=10,
                    last_heartbeat_at=heartbeat_at,
                    taken_over_from_lease_id=takeover_from,
                ),
                ctx=ctx,
            )
            draft = await self._draft_layout_repository.find_by_home_id(input.home_id, ctx=ctx)
            base_layout_version = draft.base_layout_version if draft is not None else None
            if draft is None:
                current_layout = await self._layout_version_repository.find_current_by_home(
                    input.home_id,
                    ctx=ctx,
                )
                base_layout_version = current_layout.layout_version if current_layout is not None else "INITIAL"
                draft = await self._draft_layout_repository.upsert(
                    DraftLayoutUpsertRow(
                        home_id=input.home_id,
                        draft_version=self._version_token_generator.next_draft_version(),
                        base_layout_version=base_layout_version,
                        background_asset_id=current_layout.background_asset_id if current_layout is not None else None,
                        layout_meta_json={},
                        readonly_snapshot_json=None,
                        updated_by_member_id=input.member_id,
                        updated_by_terminal_id=input.terminal_id,
                    ),
                    ctx=ctx,
                )
                if current_layout is not None:
                    current_hotspots = await self._layout_hotspot_repository.list_by_layout_version_id(
                        current_layout.id,
                        ctx=ctx,
                    )
                    await self._draft_hotspot_repository.replace_for_draft_layout(
                        draft.id,
                        [
                            DraftHotspotSnapshotRow(
                                draft_layout_id=draft.id,
                                hotspot_id=hotspot.hotspot_id,
                                device_id=hotspot.device_id,
                                x=hotspot.x,
                                y=hotspot.y,
                                icon_type=hotspot.icon_type,
                                label_mode=hotspot.label_mode,
                                is_visible=hotspot.is_visible,
                                structure_order=hotspot.structure_order,
                            )
                            for hotspot in current_hotspots
                        ],
                        ctx=ctx,
                    )
            await self._ws_event_outbox_repository.insert(
                NewWsEventOutboxRow(
                    home_id=input.home_id,
                    event_id=self._event_id_generator.next_event_id(),
                    event_type="draft_lock_acquired",
                    change_domain="EDITOR_LOCK",
                    snapshot_required=False,
                    payload_json={
                        "lease_id": inserted_lease.lease_id,
                        "terminal_id": input.terminal_id,
                        "lease_expires_at": inserted_lease.lease_expires_at,
                    },
                    occurred_at=now.isoformat(),
                ),
                ctx=ctx,
            )
            return EditorSessionView(
                granted=True,
                lock_status="GRANTED",
                lease_id=inserted_lease.lease_id,
                lease_expires_at=inserted_lease.lease_expires_at,
                heartbeat_interval_seconds=10,
                locked_by=input.terminal_id,
                draft_version=draft.draft_version,
                current_layout_version=base_layout_version,
            )

        return await self._unit_of_work.run_in_transaction(_transaction)

    async def heartbeat(self, input: EditorHeartbeatInput) -> EditorHeartbeatView:
        lease = await self._draft_lease_repository.find_by_lease_id(input.home_id, input.lease_id)
        if lease is None or not lease.is_active or lease.terminal_id != input.terminal_id:
            raise AppError(ErrorCode.DRAFT_LOCK_LOST, "active editor lease is required")
        now = self._clock.now()
        expires_at = (now + timedelta(seconds=30)).isoformat()
        updated = await self._draft_lease_repository.heartbeat(
            input.lease_id,
            now.isoformat(),
            expires_at,
        )
        if updated == 0:
            raise AppError(ErrorCode.DRAFT_LOCK_LOST, "editor lease heartbeat failed")
        return EditorHeartbeatView(
            lease_id=input.lease_id,
            lease_expires_at=expires_at,
            lock_status="GRANTED",
        )
