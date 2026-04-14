from __future__ import annotations

from dataclasses import dataclass

from src.modules.auth.services.guard.ManagementPinGuard import ManagementPinGuard
from src.repositories.base.editor.DraftHotspotRepository import DraftHotspotRepository
from src.repositories.base.editor.DraftLayoutRepository import DraftLayoutRepository
from src.repositories.base.editor.DraftLeaseRepository import DraftLeaseRepository
from src.repositories.base.realtime.WsEventOutboxRepository import NewWsEventOutboxRow, WsEventOutboxRepository
from src.repositories.base.settings.LayoutHotspotRepository import (
    LayoutHotspotRepository,
    LayoutHotspotSnapshotRow,
)
from src.repositories.base.settings.LayoutVersionRepository import LayoutVersionRepository, NewLayoutVersionRow
from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode
from src.shared.kernel.Clock import Clock
from src.shared.kernel.EventIdGenerator import EventIdGenerator
from src.shared.kernel.RepoContext import RepoContext
from src.shared.kernel.UnitOfWork import UnitOfWork
from src.shared.kernel.VersionTokenGenerator import VersionTokenGenerator


@dataclass(frozen=True)
class EditorPublishInput:
    home_id: str
    terminal_id: str
    lease_id: str
    draft_version: str
    base_layout_version: str
    member_id: str | None = None


@dataclass(frozen=True)
class EditorPublishView:
    published: bool
    layout_version: str
    effective_at: str
    lock_released: bool


class EditorPublishService:
    def __init__(
        self,
        unit_of_work: UnitOfWork,
        draft_layout_repository: DraftLayoutRepository,
        draft_hotspot_repository: DraftHotspotRepository,
        draft_lease_repository: DraftLeaseRepository,
        layout_version_repository: LayoutVersionRepository,
        layout_hotspot_repository: LayoutHotspotRepository,
        ws_event_outbox_repository: WsEventOutboxRepository,
        management_pin_guard: ManagementPinGuard,
        version_token_generator: VersionTokenGenerator,
        event_id_generator: EventIdGenerator,
        clock: Clock,
    ) -> None:
        self._unit_of_work = unit_of_work
        self._draft_layout_repository = draft_layout_repository
        self._draft_hotspot_repository = draft_hotspot_repository
        self._draft_lease_repository = draft_lease_repository
        self._layout_version_repository = layout_version_repository
        self._layout_hotspot_repository = layout_hotspot_repository
        self._ws_event_outbox_repository = ws_event_outbox_repository
        self._management_pin_guard = management_pin_guard
        self._version_token_generator = version_token_generator
        self._event_id_generator = event_id_generator
        self._clock = clock

    async def publish(self, input: EditorPublishInput) -> EditorPublishView:
        await self._management_pin_guard.require_active_session(input.home_id, input.terminal_id)
        lease = await self._draft_lease_repository.find_by_lease_id(input.home_id, input.lease_id)
        if lease is None or not lease.is_active or lease.terminal_id != input.terminal_id:
            raise AppError(ErrorCode.DRAFT_LOCK_LOST, "active editor lease is required")
        draft = await self._draft_layout_repository.find_by_home_id(input.home_id)
        if draft is None:
            raise AppError(ErrorCode.DRAFT_LOCK_LOST, "draft context is missing")
        if draft.draft_version != input.draft_version or draft.base_layout_version != input.base_layout_version:
            raise AppError(ErrorCode.VERSION_CONFLICT, "draft version is stale")

        layout_version = self._version_token_generator.next_layout_version()
        now_iso = self._clock.now().isoformat()

        async def _transaction(tx) -> None:
            ctx = RepoContext(tx=tx)
            inserted = await self._layout_version_repository.insert(
                NewLayoutVersionRow(
                    home_id=input.home_id,
                    layout_version=layout_version,
                    background_asset_id=draft.background_asset_id,
                    layout_meta_json=draft.layout_meta_json,
                    effective_at=now_iso,
                    published_by_member_id=input.member_id,
                    published_by_terminal_id=input.terminal_id,
                ),
                ctx=ctx,
            )
            draft_hotspots = await self._draft_hotspot_repository.list_by_draft_layout_id(
                draft.id,
                ctx=ctx,
            )
            await self._layout_hotspot_repository.replace_for_layout_version(
                inserted.id,
                [
                    LayoutHotspotSnapshotRow(
                        layout_version_id=inserted.id,
                        hotspot_id=hotspot.hotspot_id,
                        device_id=hotspot.device_id,
                        x=hotspot.x,
                        y=hotspot.y,
                        icon_type=hotspot.icon_type,
                        label_mode=hotspot.label_mode,
                        is_visible=hotspot.is_visible,
                        structure_order=hotspot.structure_order,
                        display_policy=None,
                    )
                    for hotspot in draft_hotspots
                ],
                ctx=ctx,
            )
            await self._draft_lease_repository.deactivate_lease(
                input.lease_id,
                "RELEASED",
                None,
                ctx=ctx,
            )
            await self._draft_layout_repository.delete_by_home_id(input.home_id, ctx=ctx)
            await self._ws_event_outbox_repository.insert(
                NewWsEventOutboxRow(
                    home_id=input.home_id,
                    event_id=self._event_id_generator.next_event_id(),
                    event_type="publish_succeeded",
                    change_domain="LAYOUT",
                    snapshot_required=True,
                    payload_json={
                        "layout_version": layout_version,
                        "effective_at": now_iso,
                        "published_by_terminal_id": input.terminal_id,
                    },
                    occurred_at=now_iso,
                ),
                ctx=ctx,
            )

        await self._unit_of_work.run_in_transaction(_transaction)
        return EditorPublishView(
            published=True,
            layout_version=layout_version,
            effective_at=now_iso,
            lock_released=True,
        )
