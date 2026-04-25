from __future__ import annotations

from pathlib import Path


class FileSystemAssetStorage:
    def __init__(self, storage_root: Path | None = None) -> None:
        self._storage_root = (
            storage_root
            if storage_root is not None
            else Path(__file__).resolve().parents[3] / "storage" / "page-assets"
        )

    def save_floorplan(
        self,
        *,
        home_id: str,
        filename: str,
        data: bytes,
        timestamp_token: str,
    ) -> str:
        suffix = Path(filename or "floorplan.bin").suffix or ".bin"
        storage_dir = self._storage_root / home_id
        storage_dir.mkdir(parents=True, exist_ok=True)
        stored_path = storage_dir / f"floorplan_{timestamp_token}{suffix}"
        stored_path.write_bytes(data)
        return str(stored_path)

    def save_hotspot_icon(
        self,
        *,
        home_id: str,
        filename: str,
        data: bytes,
        timestamp_token: str,
    ) -> str:
        suffix = Path(filename or "hotspot-icon.bin").suffix or ".bin"
        storage_dir = self._storage_root / home_id / "hotspot-icons"
        storage_dir.mkdir(parents=True, exist_ok=True)
        stored_path = storage_dir / f"hotspot_icon_{timestamp_token}{suffix}"
        stored_path.write_bytes(data)
        return str(stored_path)

    def file_exists(self, path: str) -> bool:
        candidate = Path(path)
        return candidate.exists() and candidate.is_file()
