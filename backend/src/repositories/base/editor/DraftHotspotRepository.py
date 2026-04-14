from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from src.repositories.rows.index import DraftHotspotRow
from src.shared.kernel.RepoContext import RepoContext


@dataclass(frozen=True)
class DraftHotspotSnapshotRow:
    draft_layout_id: str
    hotspot_id: str
    device_id: str
    x: float
    y: float
    icon_type: str | None
    label_mode: str | None
    is_visible: bool
    structure_order: int


class DraftHotspotRepository(Protocol):
    async def list_by_draft_layout_id(
        self,
        draft_layout_id: str,
        ctx: RepoContext | None = None,
    ) -> list[DraftHotspotRow]: ...

    async def replace_for_draft_layout(
        self,
        draft_layout_id: str,
        hotspots: list[DraftHotspotSnapshotRow],
        ctx: RepoContext | None = None,
    ) -> None: ...
