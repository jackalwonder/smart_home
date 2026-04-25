from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from src.modules.auth.services.guard.ManagementPinGuard import ManagementPinGuard
from src.repositories.base.backups.BackupRepository import (
    BackupCreateRow,
    BackupRepository,
)
from src.shared.kernel.Clock import Clock


@dataclass(frozen=True)
class BackupCreateView:
    backup_id: str
    created_at: str
    status: str


def _decode_snapshot_for_preview(snapshot_blob: Any) -> dict[str, Any] | None:
    try:
        raw_snapshot = (
            snapshot_blob
            if isinstance(snapshot_blob, str)
            else bytes(snapshot_blob).decode("utf-8")
        )
        snapshot = json.loads(raw_snapshot)
    except (TypeError, ValueError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    return snapshot if isinstance(snapshot, dict) else None


def _as_preview_mapping(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_preview_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _as_preview_string(value: Any) -> str | None:
    return value if isinstance(value, str) and value.strip() else None


def build_snapshot_preview(
    snapshot_blob: Any,
    *,
    current_settings_version: str | None,
    current_layout_version: str | None,
) -> dict[str, Any]:
    snapshot = _decode_snapshot_for_preview(snapshot_blob)
    if snapshot is None:
        return {
            "summary": {
                "snapshot_status": "INVALID",
                "settings_version": None,
                "layout_version": None,
                "favorite_count": 0,
                "hotspot_count": 0,
                "has_page_settings": False,
                "has_function_settings": False,
                "has_background_asset": False,
            },
            "comparison": {
                "current_settings_version": current_settings_version,
                "current_layout_version": current_layout_version,
                "settings_matches_current": False,
                "layout_matches_current": False,
            },
        }

    settings = _as_preview_mapping(snapshot.get("settings"))
    layout = _as_preview_mapping(snapshot.get("layout"))
    settings_version = _as_preview_string(settings.get("settings_version"))
    layout_version = _as_preview_string(layout.get("layout_version"))
    background_asset_id = _as_preview_string(layout.get("background_asset_id"))

    return {
        "summary": {
            "snapshot_status": "READY",
            "settings_version": settings_version,
            "layout_version": layout_version,
            "favorite_count": len(_as_preview_list(settings.get("favorites"))),
            "hotspot_count": len(_as_preview_list(layout.get("hotspots"))),
            "has_page_settings": isinstance(settings.get("page_settings"), dict),
            "has_function_settings": isinstance(settings.get("function_settings"), dict),
            "has_background_asset": background_asset_id is not None,
        },
        "comparison": {
            "current_settings_version": current_settings_version,
            "current_layout_version": current_layout_version,
            "settings_matches_current": (
                settings_version is not None and settings_version == current_settings_version
            ),
            "layout_matches_current": (
                layout_version is not None and layout_version == current_layout_version
            ),
        },
    }


class BackupService:
    def __init__(
        self,
        backup_repository: BackupRepository,
        management_pin_guard: ManagementPinGuard,
        clock: Clock,
    ) -> None:
        self._backup_repository = backup_repository
        self._management_pin_guard = management_pin_guard
        self._clock = clock

    async def create_backup(
        self,
        *,
        home_id: str,
        terminal_id: str,
        operator_id: str | None,
        note: str | None,
    ) -> BackupCreateView:
        await self._management_pin_guard.require_active_session(home_id, terminal_id)
        snapshot = await self._backup_repository.build_current_snapshot(home_id)
        backup_id = f"bk_{self._clock.now().strftime('%Y%m%d%H%M%S%f')}"
        now_iso = self._clock.now().isoformat()
        snapshot_blob = json.dumps(snapshot, sort_keys=True, ensure_ascii=True).encode("utf-8")
        await self._backup_repository.create_backup(
            BackupCreateRow(
                home_id=home_id,
                backup_id=backup_id,
                status="READY",
                note=note,
                snapshot_blob=snapshot_blob,
                created_by_member_id=operator_id,
                created_by_terminal_id=terminal_id,
                created_at=now_iso,
            )
        )
        return BackupCreateView(backup_id=backup_id, created_at=now_iso, status="READY")

    async def list_backups(
        self,
        *,
        home_id: str,
        terminal_id: str,
    ) -> dict[str, Any]:
        await self._management_pin_guard.require_active_session(home_id, terminal_id)
        rows = await self._backup_repository.list_backups(home_id)
        return {
            "items": [
                {
                    "backup_id": row.backup_id,
                    "created_at": row.created_at,
                    "restored_at": row.restored_at,
                    "created_by": row.created_by,
                    "status": row.status,
                    "note": row.note,
                    **build_snapshot_preview(
                        row.snapshot_blob,
                        current_settings_version=row.current_settings_version,
                        current_layout_version=row.current_layout_version,
                    ),
                }
                for row in rows
            ]
        }
