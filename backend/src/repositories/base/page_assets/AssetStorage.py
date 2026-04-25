from __future__ import annotations

from typing import Protocol


class AssetStorage(Protocol):
    def save_floorplan(
        self,
        *,
        home_id: str,
        filename: str,
        data: bytes,
        timestamp_token: str,
    ) -> str: ...

    def save_hotspot_icon(
        self,
        *,
        home_id: str,
        filename: str,
        data: bytes,
        timestamp_token: str,
    ) -> str: ...

    def file_exists(self, path: str) -> bool: ...
