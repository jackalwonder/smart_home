from __future__ import annotations

import hashlib
from dataclasses import dataclass

from src.modules.auth.services.guard.ManagementPinGuard import ManagementPinGuard
from src.repositories.base.page_assets.AssetStorage import AssetStorage
from src.repositories.base.page_assets.PageAssetRepository import (
    PageAssetRepository,
    PageAssetWriteInput,
)
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


@dataclass(frozen=True)
class FloorplanAssetFileView:
    path: str
    mime_type: str


@dataclass(frozen=True)
class HotspotIconAssetView:
    asset_id: str
    icon_asset_url: str
    mime_type: str
    width: int | None
    height: int | None
    updated_at: str


@dataclass(frozen=True)
class HotspotIconAssetFileView:
    path: str
    mime_type: str


class FloorplanAssetService:
    def __init__(
        self,
        page_asset_repository: PageAssetRepository,
        asset_storage: AssetStorage,
        management_pin_guard: ManagementPinGuard,
        clock: Clock,
    ) -> None:
        self._page_asset_repository = page_asset_repository
        self._asset_storage = asset_storage
        self._management_pin_guard = management_pin_guard
        self._clock = clock

    def _validate_image_upload(
        self,
        *,
        content_type: str | None,
        data: bytes,
        max_bytes: int,
    ) -> None:
        if not data:
            raise AppError(
                ErrorCode.INVALID_PARAMS,
                "file is required",
                details={"fields": [{"field": "file", "reason": "required"}]},
            )
        if len(data) > max_bytes:
            raise AppError(
                ErrorCode.INVALID_PARAMS,
                "file is too large",
                details={"fields": [{"field": "file", "reason": "too_large"}]},
            )
        if content_type is not None and not content_type.startswith("image/"):
            raise AppError(
                ErrorCode.INVALID_PARAMS,
                "file must be an image",
                details={"fields": [{"field": "file", "reason": "invalid_type"}]},
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
        await self._management_pin_guard.require_active_session(home_id, terminal_id)
        self._validate_image_upload(
            content_type=content_type,
            data=data,
            max_bytes=8 * 1024 * 1024,
        )

        timestamp = self._clock.now().strftime("%Y%m%d%H%M%S%f")
        stored_path = self._asset_storage.save_floorplan(
            home_id=home_id,
            filename=filename,
            data=data,
            timestamp_token=timestamp,
        )

        width, height = _image_size(data)
        file_hash = hashlib.sha256(data).hexdigest()
        now_iso = self._clock.now().isoformat()
        row = await self._page_asset_repository.upsert_floorplan_asset(
            PageAssetWriteInput(
                home_id=home_id,
                file_url=stored_path,
                file_hash=file_hash,
                width=width,
                height=height,
                mime_type=content_type or "application/octet-stream",
                uploaded_by_member_id=operator_id,
                uploaded_by_terminal_id=terminal_id,
            ),
            replace_current=replace_current,
        )

        return FloorplanAssetView(
            asset_updated=True,
            asset_id=row.asset_id,
            background_image_url=f"/api/v1/page-assets/floorplan/{row.asset_id}/file",
            background_image_size={"width": width, "height": height},
            updated_at=row.updated_at or now_iso,
        )

    async def get_floorplan_file(
        self,
        *,
        home_id: str,
        asset_id: str,
    ) -> FloorplanAssetFileView:
        row = await self._page_asset_repository.find_asset_file(
            home_id=home_id,
            asset_id=asset_id,
            asset_type="FLOORPLAN",
        )
        if row is None:
            raise AppError(ErrorCode.NOT_FOUND, "floorplan asset not found")

        if not self._asset_storage.file_exists(row.file_url):
            raise AppError(
                ErrorCode.NOT_FOUND,
                "floorplan asset file not found",
                details={"asset_id": asset_id},
            )

        return FloorplanAssetFileView(
            path=row.file_url,
            mime_type=row.mime_type or "application/octet-stream",
        )

    async def upload_hotspot_icon(
        self,
        *,
        home_id: str,
        terminal_id: str,
        operator_id: str | None,
        filename: str,
        content_type: str | None,
        data: bytes,
    ) -> HotspotIconAssetView:
        await self._management_pin_guard.require_active_session(home_id, terminal_id)
        self._validate_image_upload(
            content_type=content_type,
            data=data,
            max_bytes=512 * 1024,
        )

        timestamp = self._clock.now().strftime("%Y%m%d%H%M%S%f")
        stored_path = self._asset_storage.save_hotspot_icon(
            home_id=home_id,
            filename=filename,
            data=data,
            timestamp_token=timestamp,
        )

        width, height = _image_size(data)
        file_hash = hashlib.sha256(data).hexdigest()
        now_iso = self._clock.now().isoformat()
        row = await self._page_asset_repository.create_hotspot_icon_asset(
            PageAssetWriteInput(
                home_id=home_id,
                file_url=stored_path,
                file_hash=file_hash,
                width=width,
                height=height,
                mime_type=content_type or "application/octet-stream",
                uploaded_by_member_id=operator_id,
                uploaded_by_terminal_id=terminal_id,
            )
        )

        return HotspotIconAssetView(
            asset_id=row.asset_id,
            icon_asset_url=f"/api/v1/page-assets/hotspot-icons/{row.asset_id}/file",
            mime_type=content_type or "application/octet-stream",
            width=width,
            height=height,
            updated_at=row.updated_at or now_iso,
        )

    async def get_hotspot_icon_file(
        self,
        *,
        home_id: str,
        asset_id: str,
    ) -> HotspotIconAssetFileView:
        row = await self._page_asset_repository.find_asset_file(
            home_id=home_id,
            asset_id=asset_id,
            asset_type="HOTSPOT_ICON",
        )
        if row is None:
            raise AppError(ErrorCode.NOT_FOUND, "hotspot icon asset not found")

        if not self._asset_storage.file_exists(row.file_url):
            raise AppError(
                ErrorCode.NOT_FOUND,
                "hotspot icon asset file not found",
                details={"asset_id": asset_id},
            )

        return HotspotIconAssetFileView(
            path=row.file_url,
            mime_type=row.mime_type or "application/octet-stream",
        )
