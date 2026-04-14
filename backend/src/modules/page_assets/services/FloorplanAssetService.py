from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import session_scope
from src.modules.auth.services.guard.ManagementPinGuard import ManagementPinGuard
from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode
from src.shared.kernel.Clock import Clock


def _image_size(data: bytes) -> tuple[int | None, int | None]:
    if len(data) >= 24 and data.startswith(b"\x89PNG\r\n\x1a\n"):
        return int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")
    if len(data) >= 10 and data.startswith((b"GIF87a", b"GIF89a")):
        return int.from_bytes(data[6:8], "little"), int.from_bytes(data[8:10], "little")
    if len(data) >= 4 and data.startswith(b"\xff\xd8"):
        index = 2
        while index + 9 < len(data):
            if data[index] != 0xFF:
                index += 1
                continue
            marker = data[index + 1]
            if marker in {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}:
                return (
                    int.from_bytes(data[index + 7 : index + 9], "big"),
                    int.from_bytes(data[index + 5 : index + 7], "big"),
                )
            if index + 4 > len(data):
                break
            block_length = int.from_bytes(data[index + 2 : index + 4], "big")
            if block_length <= 0:
                break
            index += block_length + 2
    return None, None


@dataclass(frozen=True)
class FloorplanAssetView:
    asset_updated: bool
    asset_id: str
    background_image_url: str
    background_image_size: dict[str, int | None]
    updated_at: str


class FloorplanAssetService:
    def __init__(
        self,
        database: Database,
        management_pin_guard: ManagementPinGuard,
        clock: Clock,
    ) -> None:
        self._database = database
        self._management_pin_guard = management_pin_guard
        self._clock = clock
        self._storage_root = (
            Path(__file__).resolve().parents[4] / "storage" / "page-assets"
        )

    async def upload_floorplan(
        self,
        *,
        home_id: str,
        terminal_id: str,
        operator_id: str | None,
        filename: str,
        content_type: str | None,
        data: bytes,
        replace_current: bool,
    ) -> FloorplanAssetView:
        del replace_current
        await self._management_pin_guard.require_active_session(home_id, terminal_id)
        if not data:
            raise AppError(
                ErrorCode.INVALID_PARAMS,
                "file is required",
                details={"fields": [{"field": "file", "reason": "required"}]},
            )
        if content_type is not None and not content_type.startswith("image/"):
            raise AppError(
                ErrorCode.INVALID_PARAMS,
                "file must be an image",
                details={"fields": [{"field": "file", "reason": "invalid_type"}]},
            )

        suffix = Path(filename or "floorplan.bin").suffix or ".bin"
        timestamp = self._clock.now().strftime("%Y%m%d%H%M%S%f")
        storage_dir = self._storage_root / home_id
        storage_dir.mkdir(parents=True, exist_ok=True)
        stored_path = storage_dir / f"floorplan_{timestamp}{suffix}"
        stored_path.write_bytes(data)

        width, height = _image_size(data)
        file_hash = hashlib.sha256(data).hexdigest()
        now_iso = self._clock.now().isoformat()

        stmt = text(
            """
            INSERT INTO page_assets (
                home_id,
                asset_type,
                file_url,
                file_hash,
                width,
                height,
                mime_type,
                uploaded_by_member_id,
                uploaded_by_terminal_id
            ) VALUES (
                :home_id,
                'FLOORPLAN',
                :file_url,
                :file_hash,
                :width,
                :height,
                :mime_type,
                :uploaded_by_member_id,
                :uploaded_by_terminal_id
            )
            RETURNING id::text AS asset_id, created_at::text AS created_at
            """
        )
        async with session_scope(self._database) as (session, owned):
            row = (
                await session.execute(
                    stmt,
                    {
                        "home_id": home_id,
                        "file_url": str(stored_path),
                        "file_hash": file_hash,
                        "width": width,
                        "height": height,
                        "mime_type": content_type or "application/octet-stream",
                        "uploaded_by_member_id": operator_id,
                        "uploaded_by_terminal_id": terminal_id,
                    },
                )
            ).mappings().one()
            if owned:
                await session.commit()

        return FloorplanAssetView(
            asset_updated=True,
            asset_id=row["asset_id"],
            background_image_url=str(stored_path),
            background_image_size={"width": width, "height": height},
            updated_at=row["created_at"] or now_iso,
        )
