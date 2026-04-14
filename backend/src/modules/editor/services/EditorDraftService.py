from __future__ import annotations

from dataclasses import dataclass
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
from src.repositories.query.editor.EditorDraftQueryRepository import EditorDraftQueryRepository
from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode
from src.shared.kernel.UnitOfWork import UnitOfWork
from src.shared.kernel.VersionTokenGenerator import VersionTokenGenerator


@dataclass(frozen=True)
class EditorDraftInput:
    home_id: str


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
class EditorDraftSaveView:
    saved_to_draft: bool
    draft_version: str
    preview_only: bool
    lock_status: str


class EditorDraftService:
    def __init__(
        self,
        unit_of_work: UnitOfWork,
        editor_draft_query_repository: EditorDraftQueryRepository,
        draft_layout_repository: DraftLayoutRepository,
        draft_hotspot_repository: DraftHotspotRepository,
        draft_lease_repository: DraftLeaseRepository,
        management_pin_guard: ManagementPinGuard,
        version_token_generator: VersionTokenGenerator,
    ) -> None:
        self._unit_of_work = unit_of_work
        self._editor_draft_query_repository = editor_draft_query_repository
        self._draft_layout_repository = draft_layout_repository
        self._draft_hotspot_repository = draft_hotspot_repository
        self._draft_lease_repository = draft_lease_repository
        self._management_pin_guard = management_pin_guard
        self._version_token_generator = version_token_generator

    async def get_draft(self, input: EditorDraftInput):
        return await self._editor_draft_query_repository.get_draft_context(input.home_id)

    async def save_draft(self, input: EditorDraftSaveInput) -> EditorDraftSaveView:
        await self._management_pin_guard.require_active_session(input.home_id, input.terminal_id)
        lease = await self._draft_lease_repository.find_by_lease_id(input.home_id, input.lease_id)
        if lease is None or not lease.is_active or lease.terminal_id != input.terminal_id:
            raise AppError(ErrorCode.DRAFT_LOCK_LOST, "active editor lease is required")
        draft = await self._draft_layout_repository.find_by_home_id(input.home_id)
        if draft is None:
            raise AppError(ErrorCode.DRAFT_LOCK_LOST, "draft context is missing")
        if draft.draft_version != input.draft_version or draft.base_layout_version != input.base_layout_version:
            raise AppError(ErrorCode.VERSION_CONFLICT, "draft version is stale")

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
        if lease is None or not lease.is_active or lease.terminal_id != input.terminal_id:
            raise AppError(ErrorCode.DRAFT_LOCK_LOST, "active editor lease is required")

        draft = await self._draft_layout_repository.find_by_home_id(input.home_id)
        if (
            input.draft_version is not None
            and draft is not None
            and draft.draft_version != input.draft_version
        ):
            raise AppError(ErrorCode.VERSION_CONFLICT, "draft version is stale")

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
