from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from src.shared.kernel.RepoContext import RepoContext


@dataclass(frozen=True)
class LayoutHotspotSnapshotRow:
    layout_version_id: str
    hotspot_id: str
    device_id: str
    x: float
    y: float
    icon_type: str | None
    icon_asset_id: str | None
    label_mode: str | None
    is_visible: bool
    structure_order: int
    display_policy: str | None


class LayoutHotspotRepository(Protocol):
    async def list_by_layout_version_id(
        self,
        layout_version_id: str,
        ctx: RepoContext | None = None,
    ) -> list[LayoutHotspotSnapshotRow]: ...

    async def replace_for_layout_version(
        self,
        layout_version_id: str,
        hotspots: list[LayoutHotspotSnapshotRow],
        ctx: RepoContext | None = None,
    ) -> None: ...
