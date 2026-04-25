from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class PageAssetWriteInput:
    home_id: str
    file_url: str
    file_hash: str
    width: int | None
    height: int | None
    mime_type: str
    uploaded_by_member_id: str | None
    uploaded_by_terminal_id: str


@dataclass(frozen=True)
class PageAssetWriteRow:
    asset_id: str
    updated_at: str | None


@dataclass(frozen=True)
class PageAssetFileRow:
    file_url: str
    mime_type: str | None


class PageAssetRepository(Protocol):
    async def upsert_floorplan_asset(
        self,
        input: PageAssetWriteInput,
        *,
        replace_current: bool,
    ) -> PageAssetWriteRow: ...

    async def create_hotspot_icon_asset(
        self,
        input: PageAssetWriteInput,
    ) -> PageAssetWriteRow: ...

    async def find_asset_file(
        self,
        *,
        home_id: str,
        asset_id: str,
        asset_type: str,
    ) -> PageAssetFileRow | None: ...
