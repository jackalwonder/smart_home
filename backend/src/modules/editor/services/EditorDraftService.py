from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from src.modules.auth.services.guard.ManagementPinGuard import ManagementPinGuard
from src.modules.editor.services.EditorDraftConflictDetails import EditorDraftConflictDetails
from src.modules.editor.services.EditorDraftDiffBuilder import (
    EditorDraftDiffBuilder,
    EditorDraftDiffItem,
)
from src.repositories.base.editor.DraftHotspotRepository import (
    DraftHotspotRepository,
    DraftHotspotSnapshotRow,
)
from src.repositories.base.editor.DraftLayoutRepository import (
    DraftLayoutRepository,
    DraftLayoutUpsertRow,
)
from src.repositories.base.editor.DraftLeaseRepository import DraftLeaseRepository
from src.repositories.base.settings.LayoutHotspotRepository import LayoutHotspotRepository
from src.repositories.base.settings.LayoutVersionRepository import LayoutVersionRepository
from src.repositories.query.editor.EditorDraftQueryRepository import EditorDraftQueryRepository
from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode
from src.shared.kernel.Clock import Clock
from src.shared.kernel.UnitOfWork import UnitOfWork
from src.shared.kernel.VersionTokenGenerator import VersionTokenGenerator


@dataclass(frozen=True)
class EditorDraftInput:
    home_id: str
    terminal_id: str | None = None
    lease_id: str | None = None


@dataclass(frozen=True)
class EditorDraftSaveInput:
    home_id: str
    terminal_id: str
    lease_id: str
    draft_version: str
    base_layout_version: str
    background_asset_id: str | None
    layout_meta: dict[str, Any]
    hotspots: list[dict[str, Any]]
    member_id: str | None = None


@dataclass(frozen=True)
class EditorDraftDiscardInput:
    home_id: str
    terminal_id: str
    lease_id: str
    draft_version: str | None = None


@dataclass(frozen=True)
class EditorDraftDiffInput:
    home_id: str
    base_layout_version: str | None
    background_asset_id: str | None
    layout_meta: dict[str, Any]
    hotspots: list[dict[str, Any]]


@dataclass(frozen=True)
class EditorDraftDiffItemView:
    change_type: str
    label: str
    count: int
    summary: str
    preview: list[str]


@dataclass(frozen=True)
class EditorDraftDiffView:
    base_layout_version: str | None
    compared_layout_version: str | None
    has_changes: bool
    total_changes: int
    items: list[EditorDraftDiffItemView]


@dataclass(frozen=True)
class EditorDraftSaveView:
    saved_to_draft: bool
    draft_version: str
    preview_only: bool
    lock_status: str


@dataclass(frozen=True)
class EditorDraftView:
    draft_exists: bool
    draft_version: str | None
    base_layout_version: str | None
    lock_status: str
    layout: dict[str, Any] | None
    readonly: bool


class EditorDraftService:
    def __init__(
        self,
        unit_of_work: UnitOfWork,
        editor_draft_query_repository: EditorDraftQueryRepository,
        draft_layout_repository: DraftLayoutRepository,
        draft_hotspot_repository: DraftHotspotRepository,
        draft_lease_repository: DraftLeaseRepository,
        layout_version_repository: LayoutVersionRepository,
        layout_hotspot_repository: LayoutHotspotRepository,
        management_pin_guard: ManagementPinGuard,
        version_token_generator: VersionTokenGenerator,
        clock: Clock,
        diff_builder: EditorDraftDiffBuilder | None = None,
        conflict_details: EditorDraftConflictDetails | None = None,
    ) -> None:
        self._unit_of_work = unit_of_work
        self._editor_draft_query_repository = editor_draft_query_repository
        self._draft_layout_repository = draft_layout_repository
        self._draft_hotspot_repository = draft_hotspot_repository
        self._draft_lease_repository = draft_lease_repository
        self._layout_version_repository = layout_version_repository
        self._layout_hotspot_repository = layout_hotspot_repository
        self._management_pin_guard = management_pin_guard
        self._version_token_generator = version_token_generator
        self._clock = clock
        self._diff_builder = diff_builder or EditorDraftDiffBuilder()
        self._conflict_details = conflict_details or EditorDraftConflictDetails(
            clock=clock,
            lease_validator=self._is_lease_valid,
        )

    def _extract_hotspot_labels(self, layout_meta: dict[str, Any] | None) -> dict[str, str]:
        return self._diff_builder.extract_hotspot_labels(layout_meta)

    def _normalize_layout_meta(self, layout_meta: dict[str, Any] | None) -> dict[str, Any]:
        return self._diff_builder.normalize_layout_meta(layout_meta)

    def _normalize_hotspot(
        self,
        hotspot: dict[str, Any],
        labels: dict[str, str],
        fallback_index: int,
    ) -> dict[str, Any]:
        return self._diff_builder.normalize_hotspot(hotspot, labels, fallback_index)

    def _format_preview_names(self, hotspots: list[dict[str, Any]]) -> list[str]:
        return self._diff_builder._format_preview_names(hotspots)

    def _build_diff_item(
        self,
        *,
        change_type: str,
        label: str,
        hotspots: list[dict[str, Any]],
    ) -> EditorDraftDiffItemView | None:
        item = self._diff_builder._build_diff_item(
            change_type=change_type,
            label=label,
            hotspots=hotspots,
        )
        return self._to_diff_item_view(item) if item is not None else None

    def _to_diff_item_view(self, item: EditorDraftDiffItem) -> EditorDraftDiffItemView:
        return EditorDraftDiffItemView(
            change_type=item.change_type,
            label=item.label,
            count=item.count,
            summary=item.summary,
            preview=item.preview,
        )

    async def preview_diff(self, input: EditorDraftDiffInput) -> EditorDraftDiffView:
        base_layout = None
        if input.base_layout_version:
            base_layout = await self._layout_version_repository.find_by_home_and_layout_version(
                input.home_id,
                input.base_layout_version,
            )

        base_hotspots_raw: list[dict[str, Any]] = []
        base_layout_meta = base_layout.layout_meta_json if base_layout is not None else {}
        if base_layout is not None:
            base_hotspots = await self._layout_hotspot_repository.list_by_layout_version_id(base_layout.id)
            base_hotspots_raw = [
                {
                    "hotspot_id": hotspot.hotspot_id,
                    "device_id": hotspot.device_id,
                    "x": hotspot.x,
                    "y": hotspot.y,
                    "icon_type": hotspot.icon_type,
                    "icon_asset_id": getattr(hotspot, "icon_asset_id", None),
                    "label_mode": hotspot.label_mode,
                    "is_visible": hotspot.is_visible,
                    "structure_order": hotspot.structure_order,
                }
                for hotspot in base_hotspots
            ]

        compared_background_asset_id = (
            base_layout.background_asset_id if base_layout is not None else None
        )
        diff_items = self._diff_builder.build_items(
            submitted_layout_meta=input.layout_meta,
            submitted_hotspots_raw=input.hotspots,
            compared_layout_meta=base_layout_meta,
            compared_hotspots_raw=base_hotspots_raw,
            submitted_background_asset_id=input.background_asset_id,
            compared_background_asset_id=compared_background_asset_id,
        )
        filtered_items = [self._to_diff_item_view(item) for item in diff_items]

        total_changes = sum(item.count for item in filtered_items)
        return EditorDraftDiffView(
            base_layout_version=input.base_layout_version,
            compared_layout_version=base_layout.layout_version if base_layout is not None else None,
            has_changes=bool(filtered_items),
            total_changes=total_changes,
            items=filtered_items,
        )

    def _is_lease_valid(self, lease, now: datetime) -> bool:
        if lease is None or not lease.is_active:
            return False
        return now < datetime.fromisoformat(lease.lease_expires_at)

    def _derive_lock_status(self, *, active_lease, terminal_id: str | None, lease_id: str | None, now: datetime) -> str:
        if not self._is_lease_valid(active_lease, now):
            return "READ_ONLY"
        if terminal_id is not None and lease_id == active_lease.lease_id and active_lease.terminal_id == terminal_id:
            return "GRANTED"
        if terminal_id is not None and active_lease.terminal_id != terminal_id:
            return "LOCKED_BY_OTHER"
        return "READ_ONLY"

    def _lock_lost_details(self, *, lease, input: EditorDraftSaveInput | EditorDraftDiscardInput) -> dict[str, Any]:
        return self._conflict_details.lock_lost_details(lease=lease, input=input)

    def _version_conflict_details(self, *, draft, submitted: dict[str, str | None]) -> dict[str, Any]:
        return self._conflict_details.version_conflict_details(
            draft=draft,
            submitted=submitted,
        )

    async def get_draft(self, input: EditorDraftInput) -> EditorDraftView:
        draft = await self._editor_draft_query_repository.get_draft_context(input.home_id)
        now = self._clock.now()
        if draft is None:
            return EditorDraftView(
                draft_exists=False,
                draft_version=None,
                base_layout_version=None,
                lock_status="READ_ONLY",
                layout=None,
                readonly=True,
            )
        lock_status = self._derive_lock_status(
            active_lease=draft.active_lease,
            terminal_id=input.terminal_id,
            lease_id=input.lease_id,
            now=now,
        )
        return EditorDraftView(
            draft_exists=True,
            draft_version=draft.draft_version,
            base_layout_version=draft.base_layout_version,
            lock_status=lock_status,
            layout={
                "background_asset_id": draft.background_asset_id,
                "background_image_url": (
                    f"/api/v1/page-assets/floorplan/{draft.background_asset_id}/file"
                    if draft.background_asset_id is not None
                    else None
                ),
                "background_image_size": None,
                "hotspots": draft.hotspots,
                "layout_meta": draft.layout_meta,
            },
            readonly=lock_status != "GRANTED",
        )

    async def save_draft(self, input: EditorDraftSaveInput) -> EditorDraftSaveView:
        await self._management_pin_guard.require_active_session(input.home_id, input.terminal_id)
        lease = await self._draft_lease_repository.find_by_lease_id(input.home_id, input.lease_id)
        if (
            lease is None
            or not lease.is_active
            or lease.terminal_id != input.terminal_id
            or not self._is_lease_valid(lease, self._clock.now())
        ):
            raise AppError(
                ErrorCode.DRAFT_LOCK_LOST,
                "active editor lease is required",
                details=self._lock_lost_details(lease=lease, input=input),
            )
        draft = await self._draft_layout_repository.find_by_home_id(input.home_id)
        if draft is None:
            raise AppError(
                ErrorCode.DRAFT_LOCK_LOST,
                "draft context is missing",
                details={
                    "reason": "DRAFT_MISSING",
                    "lease_id": input.lease_id,
                    "terminal_id": input.terminal_id,
                },
            )
        if draft.draft_version != input.draft_version or draft.base_layout_version != input.base_layout_version:
            raise AppError(
                ErrorCode.VERSION_CONFLICT,
                "draft version is stale",
                details=self._version_conflict_details(
                    draft=draft,
                    submitted={
                        "draft_version": input.draft_version,
                        "base_layout_version": input.base_layout_version,
                    },
                ),
            )

        next_draft_version = self._version_token_generator.next_draft_version()

        async def _transaction(tx) -> None:
            from src.shared.kernel.RepoContext import RepoContext

            ctx = RepoContext(tx=tx)
            updated = await self._draft_layout_repository.upsert(
                DraftLayoutUpsertRow(
                    home_id=input.home_id,
                    draft_version=next_draft_version,
                    base_layout_version=input.base_layout_version,
                    background_asset_id=input.background_asset_id,
                    layout_meta_json=input.layout_meta,
                    readonly_snapshot_json=None,
                    updated_by_member_id=input.member_id,
                    updated_by_terminal_id=input.terminal_id,
                ),
                ctx=ctx,
            )
            await self._draft_hotspot_repository.replace_for_draft_layout(
                updated.id,
                [
                    DraftHotspotSnapshotRow(
                        draft_layout_id=updated.id,
                        hotspot_id=hotspot["hotspot_id"],
                        device_id=hotspot["device_id"],
                        x=float(hotspot["x"]),
                        y=float(hotspot["y"]),
                        icon_type=hotspot.get("icon_type"),
                        icon_asset_id=hotspot.get("icon_asset_id"),
                        label_mode=hotspot.get("label_mode"),
                        is_visible=bool(hotspot.get("is_visible", True)),
                        structure_order=int(hotspot.get("structure_order", 0)),
                    )
                    for hotspot in input.hotspots
                ],
                ctx=ctx,
            )

        await self._unit_of_work.run_in_transaction(_transaction)
        return EditorDraftSaveView(
            saved_to_draft=True,
            draft_version=next_draft_version,
            preview_only=False,
            lock_status="GRANTED",
        )

    async def discard_draft(self, input: EditorDraftDiscardInput) -> dict[str, bool]:
        await self._management_pin_guard.require_active_session(input.home_id, input.terminal_id)
        lease = await self._draft_lease_repository.find_by_lease_id(input.home_id, input.lease_id)
        if (
            lease is None
            or not lease.is_active
            or lease.terminal_id != input.terminal_id
            or not self._is_lease_valid(lease, self._clock.now())
        ):
            raise AppError(
                ErrorCode.DRAFT_LOCK_LOST,
                "active editor lease is required",
                details=self._lock_lost_details(lease=lease, input=input),
            )

        draft = await self._draft_layout_repository.find_by_home_id(input.home_id)
        if (
            input.draft_version is not None
            and draft is not None
            and draft.draft_version != input.draft_version
        ):
            raise AppError(
                ErrorCode.VERSION_CONFLICT,
                "draft version is stale",
                details=self._version_conflict_details(
                    draft=draft,
                    submitted={
                        "draft_version": input.draft_version,
                        "base_layout_version": draft.base_layout_version,
                    },
                ),
            )

        async def _transaction(tx) -> None:
            from src.shared.kernel.RepoContext import RepoContext

            ctx = RepoContext(tx=tx)
            await self._draft_lease_repository.deactivate_lease(
                input.lease_id,
                "RELEASED",
                None,
                ctx=ctx,
            )
            await self._draft_layout_repository.delete_by_home_id(input.home_id, ctx=ctx)

        await self._unit_of_work.run_in_transaction(_transaction)
        return {
            "discarded": True,
            "lock_released": True,
        }
