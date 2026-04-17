from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from src.modules.auth.services.guard.ManagementPinGuard import ManagementPinGuard
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

    def _extract_hotspot_labels(self, layout_meta: dict[str, Any] | None) -> dict[str, str]:
        source = layout_meta.get("hotspot_labels") if isinstance(layout_meta, dict) else None
        if not isinstance(source, dict):
            return {}
        labels: dict[str, str] = {}
        for hotspot_id, label in source.items():
            if isinstance(hotspot_id, str) and isinstance(label, str) and label.strip():
                labels[hotspot_id] = label.strip()
        return labels

    def _normalize_layout_meta(self, layout_meta: dict[str, Any] | None) -> dict[str, Any]:
        if not isinstance(layout_meta, dict):
            return {}
        return {
            key: value
            for key, value in layout_meta.items()
            if key != "hotspot_labels"
        }

    def _normalize_hotspot(
        self,
        hotspot: dict[str, Any],
        labels: dict[str, str],
        fallback_index: int,
    ) -> dict[str, Any]:
        hotspot_id = str(hotspot.get("hotspot_id") or f"hotspot-{fallback_index}")
        device_id = str(hotspot.get("device_id") or "")
        label = labels.get(hotspot_id) or device_id or hotspot_id
        return {
            "hotspot_id": hotspot_id,
            "device_id": device_id,
            "label": label,
            "x": float(hotspot.get("x") or 0),
            "y": float(hotspot.get("y") or 0),
            "icon_type": hotspot.get("icon_type"),
            "label_mode": hotspot.get("label_mode"),
            "is_visible": bool(hotspot.get("is_visible", True)),
            "structure_order": int(hotspot.get("structure_order", fallback_index) or 0),
        }

    def _format_preview_names(self, hotspots: list[dict[str, Any]]) -> list[str]:
        return [str(hotspot["label"]) for hotspot in hotspots[:3]]

    def _build_diff_item(
        self,
        *,
        change_type: str,
        label: str,
        hotspots: list[dict[str, Any]],
    ) -> EditorDraftDiffItemView | None:
        if not hotspots:
            return None
        preview = self._format_preview_names(hotspots)
        summary = "、".join(preview)
        if len(hotspots) > 3:
            summary = f"{summary} 等 {len(hotspots)} 个"
        return EditorDraftDiffItemView(
            change_type=change_type,
            label=label,
            count=len(hotspots),
            summary=summary,
            preview=preview,
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
                    "label_mode": hotspot.label_mode,
                    "is_visible": hotspot.is_visible,
                    "structure_order": hotspot.structure_order,
                }
                for hotspot in base_hotspots
            ]

        submitted_labels = self._extract_hotspot_labels(input.layout_meta)
        base_labels = self._extract_hotspot_labels(base_layout_meta)
        submitted_hotspots = [
            self._normalize_hotspot(hotspot, submitted_labels, index)
            for index, hotspot in enumerate(input.hotspots)
        ]
        compared_hotspots = [
            self._normalize_hotspot(hotspot, base_labels, index)
            for index, hotspot in enumerate(base_hotspots_raw)
        ]
        submitted_by_id = {hotspot["hotspot_id"]: hotspot for hotspot in submitted_hotspots}
        compared_by_id = {hotspot["hotspot_id"]: hotspot for hotspot in compared_hotspots}

        added = [hotspot for hotspot in submitted_hotspots if hotspot["hotspot_id"] not in compared_by_id]
        removed = [hotspot for hotspot in compared_hotspots if hotspot["hotspot_id"] not in submitted_by_id]
        moved: list[dict[str, Any]] = []
        relabeled: list[dict[str, Any]] = []
        rebound: list[dict[str, Any]] = []
        restyled: list[dict[str, Any]] = []
        reordered: list[dict[str, Any]] = []

        for hotspot in submitted_hotspots:
            previous = compared_by_id.get(hotspot["hotspot_id"])
            if previous is None:
                continue
            if abs(hotspot["x"] - previous["x"]) > 0.0005 or abs(hotspot["y"] - previous["y"]) > 0.0005:
                moved.append(hotspot)
            if hotspot["label"] != previous["label"]:
                relabeled.append(hotspot)
            if hotspot["device_id"] != previous["device_id"]:
                rebound.append(hotspot)
            if (
                hotspot["icon_type"] != previous["icon_type"]
                or hotspot["label_mode"] != previous["label_mode"]
                or hotspot["is_visible"] != previous["is_visible"]
            ):
                restyled.append(hotspot)
            if hotspot["structure_order"] != previous["structure_order"]:
                reordered.append(hotspot)

        items = [
            self._build_diff_item(change_type="added", label="新增热点", hotspots=added),
            self._build_diff_item(change_type="removed", label="移除热点", hotspots=removed),
            self._build_diff_item(change_type="moved", label="位置调整", hotspots=moved),
            self._build_diff_item(change_type="relabeled", label="名称更新", hotspots=relabeled),
            self._build_diff_item(change_type="rebound", label="设备绑定更新", hotspots=rebound),
            self._build_diff_item(change_type="restyled", label="展示样式更新", hotspots=restyled),
            self._build_diff_item(change_type="reordered", label="排序更新", hotspots=reordered),
        ]
        filtered_items = [item for item in items if item is not None]

        if input.background_asset_id != (base_layout.background_asset_id if base_layout is not None else None):
            filtered_items.append(
                EditorDraftDiffItemView(
                    change_type="background",
                    label="背景图更新",
                    count=1,
                    summary="已设置或替换背景图" if input.background_asset_id else "已清除背景图",
                    preview=[],
                )
            )

        if self._normalize_layout_meta(input.layout_meta) != self._normalize_layout_meta(base_layout_meta):
            filtered_items.append(
                EditorDraftDiffItemView(
                    change_type="layout_meta",
                    label="布局元数据更新",
                    count=1,
                    summary="JSON 元数据已修改",
                    preview=[],
                )
            )

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
        now = self._clock.now()
        if lease is None:
            reason = "LEASE_NOT_FOUND"
        elif not lease.is_active:
            reason = "LEASE_INACTIVE"
        elif lease.terminal_id != input.terminal_id:
            reason = "TERMINAL_MISMATCH"
        elif not self._is_lease_valid(lease, now):
            reason = "LEASE_EXPIRED"
        else:
            reason = "LEASE_UNAVAILABLE"

        details: dict[str, Any] = {
            "reason": reason,
            "lease_id": input.lease_id,
            "terminal_id": input.terminal_id,
        }
        if lease is not None:
            details["active_lease"] = {
                "lease_id": lease.lease_id,
                "terminal_id": lease.terminal_id,
                "lease_status": lease.lease_status,
                "lease_expires_at": lease.lease_expires_at,
            }
        return details

    def _version_conflict_details(self, *, draft, submitted: dict[str, str | None]) -> dict[str, Any]:
        return {
            "reason": "DRAFT_VERSION_MISMATCH",
            "submitted": submitted,
            "current": {
                "draft_version": draft.draft_version if draft is not None else None,
                "base_layout_version": draft.base_layout_version if draft is not None else None,
            },
        }

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
