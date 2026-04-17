from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

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

LEASE_TTL_SECONDS = 60
HEARTBEAT_INTERVAL_SECONDS = 20


@dataclass(frozen=True)
class EditorSessionInput:
    home_id: str
    terminal_id: str
    takeover_if_locked: bool = False
    member_id: str | None = None
    expected_lease_id: str | None = None


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
    previous_terminal_id: str | None = None


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

    def _is_lease_valid(self, lease, now) -> bool:
        if lease is None or not lease.is_active:
            return False
        return lease.lease_expires_at is not None and now < datetime.fromisoformat(lease.lease_expires_at)

    async def _append_editor_lock_event(
        self,
        *,
        home_id: str,
        event_type: str,
        payload: dict[str, object | None],
        occurred_at: str,
        ctx: RepoContext,
    ) -> None:
        await self._ws_event_outbox_repository.insert(
            NewWsEventOutboxRow(
                home_id=home_id,
                event_id=self._event_id_generator.next_event_id(),
                event_type=event_type,
                change_domain="EDITOR_LOCK",
                snapshot_required=False,
                payload_json={key: value for key, value in payload.items() if value is not None},
                occurred_at=occurred_at,
            ),
            ctx=ctx,
        )

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
        active_lease_is_valid = self._is_lease_valid(active_lease, now)
        draft = await self._draft_layout_repository.find_by_home_id(input.home_id)
        if active_lease_is_valid and active_lease is not None and active_lease.terminal_id == input.terminal_id:
            return EditorSessionView(
                granted=True,
                lock_status="GRANTED",
                lease_id=active_lease.lease_id,
                lease_expires_at=active_lease.lease_expires_at,
                heartbeat_interval_seconds=HEARTBEAT_INTERVAL_SECONDS,
                locked_by=None,
                draft_version=draft.draft_version if draft is not None else None,
                current_layout_version=(
                    draft.base_layout_version
                    if draft is not None
                    else current_layout.layout_version if current_layout is not None else None
                ),
            )
        if (
            active_lease_is_valid
            and active_lease is not None
            and active_lease.terminal_id != input.terminal_id
            and not input.takeover_if_locked
        ):
            return EditorSessionView(
                granted=False,
                lock_status="LOCKED_BY_OTHER",
                lease_id=active_lease.lease_id,
                lease_expires_at=active_lease.lease_expires_at,
                heartbeat_interval_seconds=HEARTBEAT_INTERVAL_SECONDS,
                locked_by=active_lease.terminal_id,
                draft_version=draft.draft_version if draft is not None else None,
                current_layout_version=(
                    draft.base_layout_version
                    if draft is not None
                    else current_layout.layout_version if current_layout is not None else None
                ),
            )
        if (
            input.takeover_if_locked
            and input.expected_lease_id is not None
            and active_lease_is_valid
            and active_lease is not None
            and input.expected_lease_id != active_lease.lease_id
        ):
            raise AppError(ErrorCode.DRAFT_LOCK_LOST, "editor lease takeover target is stale")

        async def _transaction(tx) -> EditorSessionView:
            ctx = RepoContext(tx=tx)
            takeover_from = None
            previous_terminal_id = None
            lost_reason = None
            next_lease_status = "RELEASED"
            deactivate_reason = None
            if active_lease is not None:
                takeover_from = active_lease.lease_id
                previous_terminal_id = active_lease.terminal_id
                if active_lease_is_valid and active_lease.terminal_id != input.terminal_id:
                    lost_reason = "TAKEN_OVER"
                    next_lease_status = "TAKEN_OVER"
                    deactivate_reason = "TAKEN_OVER"
                elif not active_lease_is_valid:
                    lost_reason = "LEASE_EXPIRED"
                    next_lease_status = "LOST"
                    deactivate_reason = "LEASE_EXPIRED"
                await self._draft_lease_repository.deactivate_lease(
                    active_lease.lease_id,
                    next_lease_status,
                    deactivate_reason,
                    ctx=ctx,
                )
            lease_id = self._id_generator.next_id()
            heartbeat_at = now.isoformat()
            lease_expires_at = (now + timedelta(seconds=LEASE_TTL_SECONDS)).isoformat()
            inserted_lease = await self._draft_lease_repository.insert(
                NewDraftLeaseRow(
                    home_id=input.home_id,
                    lease_id=lease_id,
                    terminal_id=input.terminal_id,
                    member_id=input.member_id,
                    lease_status="ACTIVE",
                    is_active=True,
                    lease_expires_at=lease_expires_at,
                    heartbeat_interval_seconds=HEARTBEAT_INTERVAL_SECONDS,
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
            if (
                active_lease is not None
                and lost_reason is not None
                and previous_terminal_id is not None
                and previous_terminal_id != input.terminal_id
            ):
                await self._append_editor_lock_event(
                    home_id=input.home_id,
                    event_type="draft_lock_lost",
                    payload={
                        "lease_id": active_lease.lease_id,
                        "terminal_id": previous_terminal_id,
                        "lost_reason": lost_reason,
                    },
                    occurred_at=now.isoformat(),
                    ctx=ctx,
                )
            if (
                active_lease is not None
                and active_lease_is_valid
                and previous_terminal_id is not None
                and previous_terminal_id != input.terminal_id
            ):
                await self._append_editor_lock_event(
                    home_id=input.home_id,
                    event_type="draft_taken_over",
                    payload={
                        "previous_terminal_id": previous_terminal_id,
                        "new_terminal_id": input.terminal_id,
                        "new_operator_id": input.member_id,
                        "new_lease_id": inserted_lease.lease_id,
                        "draft_version": draft.draft_version,
                    },
                    occurred_at=now.isoformat(),
                    ctx=ctx,
                )
            await self._append_editor_lock_event(
                home_id=input.home_id,
                event_type="draft_lock_acquired",
                payload={
                    "lease_id": inserted_lease.lease_id,
                    "terminal_id": input.terminal_id,
                    "lease_expires_at": inserted_lease.lease_expires_at,
                },
                occurred_at=now.isoformat(),
                ctx=ctx,
            )
            return EditorSessionView(
                granted=True,
                lock_status="GRANTED",
                lease_id=inserted_lease.lease_id,
                lease_expires_at=inserted_lease.lease_expires_at,
                heartbeat_interval_seconds=HEARTBEAT_INTERVAL_SECONDS,
                locked_by=None,
                draft_version=draft.draft_version,
                current_layout_version=base_layout_version,
                previous_terminal_id=(
                    previous_terminal_id
                    if previous_terminal_id != input.terminal_id
                    else None
                ),
            )

        return await self._unit_of_work.run_in_transaction(_transaction)

    async def heartbeat(self, input: EditorHeartbeatInput) -> EditorHeartbeatView:
        lease = await self._draft_lease_repository.find_by_lease_id(input.home_id, input.lease_id)
        if lease is None or not lease.is_active or lease.terminal_id != input.terminal_id:
            raise AppError(ErrorCode.DRAFT_LOCK_LOST, "active editor lease is required")
        now = self._clock.now()
        if not self._is_lease_valid(lease, now):
            raise AppError(ErrorCode.DRAFT_LOCK_LOST, "active editor lease is required")
        expires_at = (now + timedelta(seconds=LEASE_TTL_SECONDS)).isoformat()
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
