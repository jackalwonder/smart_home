from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import session_scope
from src.modules.auth.services.guard.ManagementPinGuard import ManagementPinGuard
from src.repositories.base.realtime.WsEventOutboxRepository import NewWsEventOutboxRow, WsEventOutboxRepository
from src.repositories.base.settings.FavoriteDevicesRepository import (
    FavoriteDeviceSnapshotRow,
    FavoriteDevicesRepository,
)
from src.repositories.base.settings.FunctionSettingsRepository import (
    FunctionSettingsRepository,
    FunctionSettingsSnapshotRow,
)
from src.repositories.base.settings.LayoutHotspotRepository import (
    LayoutHotspotRepository,
    LayoutHotspotSnapshotRow,
)
from src.repositories.base.settings.LayoutVersionRepository import (
    LayoutVersionRepository,
    NewLayoutVersionRow,
)
from src.repositories.base.settings.PageSettingsRepository import (
    PageSettingsRepository,
    PageSettingsSnapshotRow,
)
from src.repositories.base.settings.SettingsVersionRepository import (
    NewSettingsVersionRow,
    SettingsVersionRepository,
)
from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode
from src.shared.kernel.Clock import Clock
from src.shared.kernel.EventIdGenerator import EventIdGenerator
from src.shared.kernel.RepoContext import RepoContext
from src.shared.kernel.UnitOfWork import UnitOfWork
from src.shared.kernel.VersionTokenGenerator import VersionTokenGenerator


@dataclass(frozen=True)
class BackupRestoreView:
    restored: bool
    settings_version: str
    layout_version: str
    effective_at: str
    message: str


def _invalid_backup_snapshot(reason: str, field: str = "snapshot_blob") -> AppError:
    return AppError(
        ErrorCode.INVALID_PARAMS,
        "backup snapshot is invalid",
        details={"fields": [{"field": field, "reason": reason}]},
    )


def _as_mapping(value: Any, field: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise _invalid_backup_snapshot("must_be_object", field)
    return value


def _as_optional_mapping(value: Any, field: str) -> dict[str, Any] | None:
    if value is None:
        return None
    return _as_mapping(value, field)


def _as_list(value: Any, field: str) -> list[Any]:
    if not isinstance(value, list):
        raise _invalid_backup_snapshot("must_be_array", field)
    return value


def _require_string(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise _invalid_backup_snapshot("must_be_non_empty_string", field)
    return value


def _require_number(value: Any, field: str) -> int | float:
    if isinstance(value, bool) or not isinstance(value, int | float):
        raise _invalid_backup_snapshot("must_be_number", field)
    return value


def _decode_snapshot_blob(snapshot_blob: Any) -> dict[str, Any]:
    try:
        if isinstance(snapshot_blob, str):
            raw_snapshot = snapshot_blob
        else:
            raw_snapshot = bytes(snapshot_blob).decode("utf-8")
        snapshot = json.loads(raw_snapshot)
    except (TypeError, ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise _invalid_backup_snapshot("invalid_json") from exc

    snapshot = _as_mapping(snapshot, "snapshot_blob")
    settings = _as_mapping(snapshot.get("settings"), "settings")
    layout = _as_mapping(snapshot.get("layout"), "layout")

    page_settings = _as_optional_mapping(settings.get("page_settings"), "settings.page_settings")
    if page_settings is not None:
        _require_string(
            page_settings.get("room_label_mode"),
            "settings.page_settings.room_label_mode",
        )
        _as_mapping(
            page_settings.get("homepage_display_policy", {}),
            "settings.page_settings.homepage_display_policy",
        )
        _as_mapping(page_settings.get("icon_policy", {}), "settings.page_settings.icon_policy")
        _as_mapping(
            page_settings.get("layout_preference", {}),
            "settings.page_settings.layout_preference",
        )

    function_settings = _as_optional_mapping(
        settings.get("function_settings"),
        "settings.function_settings",
    )
    if function_settings is not None:
        _require_number(
            function_settings.get("low_battery_threshold"),
            "settings.function_settings.low_battery_threshold",
        )
        _require_number(
            function_settings.get("offline_threshold_seconds"),
            "settings.function_settings.offline_threshold_seconds",
        )
        _as_mapping(
            function_settings.get("quick_entry_policy", {}),
            "settings.function_settings.quick_entry_policy",
        )
        _require_number(
            function_settings.get("favorite_limit"),
            "settings.function_settings.favorite_limit",
        )
        if function_settings.get("auto_home_timeout_seconds") is not None:
            _require_number(
                function_settings.get("auto_home_timeout_seconds"),
                "settings.function_settings.auto_home_timeout_seconds",
            )
        _as_mapping(
            function_settings.get("position_device_thresholds", {}),
            "settings.function_settings.position_device_thresholds",
        )

    favorites = _as_list(settings.get("favorites", []), "settings.favorites")
    for index, favorite in enumerate(favorites):
        favorite = _as_mapping(favorite, f"settings.favorites.{index}")
        _require_string(favorite.get("device_id"), f"settings.favorites.{index}.device_id")

    _as_mapping(layout.get("layout_meta", {}), "layout.layout_meta")
    hotspots = _as_list(layout.get("hotspots", []), "layout.hotspots")
    for index, hotspot in enumerate(hotspots):
        hotspot = _as_mapping(hotspot, f"layout.hotspots.{index}")
        _require_string(hotspot.get("hotspot_id"), f"layout.hotspots.{index}.hotspot_id")
        _require_string(hotspot.get("device_id"), f"layout.hotspots.{index}.device_id")
        _require_number(hotspot.get("x"), f"layout.hotspots.{index}.x")
        _require_number(hotspot.get("y"), f"layout.hotspots.{index}.y")

    return snapshot


class BackupRestoreService:
    def __init__(
        self,
        database: Database,
        unit_of_work: UnitOfWork,
        management_pin_guard: ManagementPinGuard,
        settings_version_repository: SettingsVersionRepository,
        favorite_devices_repository: FavoriteDevicesRepository,
        page_settings_repository: PageSettingsRepository,
        function_settings_repository: FunctionSettingsRepository,
        layout_version_repository: LayoutVersionRepository,
        layout_hotspot_repository: LayoutHotspotRepository,
        ws_event_outbox_repository: WsEventOutboxRepository,
        version_token_generator: VersionTokenGenerator,
        event_id_generator: EventIdGenerator,
        clock: Clock,
    ) -> None:
        self._database = database
        self._unit_of_work = unit_of_work
        self._management_pin_guard = management_pin_guard
        self._settings_version_repository = settings_version_repository
        self._favorite_devices_repository = favorite_devices_repository
        self._page_settings_repository = page_settings_repository
        self._function_settings_repository = function_settings_repository
        self._layout_version_repository = layout_version_repository
        self._layout_hotspot_repository = layout_hotspot_repository
        self._ws_event_outbox_repository = ws_event_outbox_repository
        self._version_token_generator = version_token_generator
        self._event_id_generator = event_id_generator
        self._clock = clock

    async def restore_backup(
        self,
        *,
        home_id: str,
        backup_id: str,
        terminal_id: str,
        operator_id: str | None,
    ) -> BackupRestoreView:
        await self._management_pin_guard.require_active_session(home_id, terminal_id)
        async with session_scope(self._database) as (session, _):
            backup_row = (
                await session.execute(
                    text(
                        """
                        SELECT status, snapshot_blob
                        FROM system_backups
                        WHERE home_id = :home_id
                          AND backup_id = :backup_id
                        """
                    ),
                    {"home_id": home_id, "backup_id": backup_id},
                )
            ).mappings().one_or_none()
        if backup_row is None or backup_row["snapshot_blob"] is None:
            raise AppError(
                ErrorCode.INVALID_PARAMS,
                "backup_id is invalid",
                details={"fields": [{"field": "backup_id", "reason": "not_found"}]},
            )
        if backup_row["status"] != "READY":
            raise AppError(
                ErrorCode.INVALID_PARAMS,
                "backup is not ready to restore",
                details={
                    "fields": [
                        {
                            "field": "backup_id",
                            "reason": "status_not_ready",
                            "status": backup_row["status"],
                        }
                    ]
                },
            )

        snapshot = _decode_snapshot_blob(backup_row["snapshot_blob"])
        settings_snapshot = snapshot.get("settings") or {}
        layout_snapshot = snapshot.get("layout") or {}
        next_settings_version = self._version_token_generator.next_settings_version()
        next_layout_version = self._version_token_generator.next_layout_version()
        now_iso = self._clock.now().isoformat()

        async def _transaction(tx) -> None:
            ctx = RepoContext(tx=tx)
            inserted_settings = await self._settings_version_repository.insert(
                NewSettingsVersionRow(
                    home_id=home_id,
                    settings_version=next_settings_version,
                    updated_domains_json=["favorites", "page_settings", "function_settings"],
                    effective_at=now_iso,
                    saved_by_member_id=operator_id,
                    saved_by_terminal_id=terminal_id,
                ),
                ctx=ctx,
            )
            page_settings = settings_snapshot.get("page_settings") or {}
            await self._page_settings_repository.upsert_for_settings_version(
                PageSettingsSnapshotRow(
                    home_id=home_id,
                    settings_version_id=inserted_settings.id,
                    room_label_mode=page_settings.get("room_label_mode", "ROOM_NAME"),
                    homepage_display_policy_json=page_settings.get("homepage_display_policy", {}),
                    icon_policy_json=page_settings.get("icon_policy", {}),
                    layout_preference_json=page_settings.get("layout_preference", {}),
                ),
                ctx=ctx,
            )
            function_settings = settings_snapshot.get("function_settings") or {}
            await self._function_settings_repository.upsert_for_settings_version(
                FunctionSettingsSnapshotRow(
                    home_id=home_id,
                    settings_version_id=inserted_settings.id,
                    low_battery_threshold=float(function_settings.get("low_battery_threshold", 20)),
                    offline_threshold_seconds=int(
                        function_settings.get("offline_threshold_seconds", 300)
                    ),
                    quick_entry_policy_json=function_settings.get("quick_entry_policy", {}),
                    music_enabled=bool(function_settings.get("music_enabled", False)),
                    favorite_limit=int(function_settings.get("favorite_limit", 8)),
                    auto_home_timeout_seconds=int(
                        function_settings.get("auto_home_timeout_seconds", 30)
                    ),
                    position_device_thresholds_json=function_settings.get(
                        "position_device_thresholds", {}
                    ),
                ),
                ctx=ctx,
            )
            await self._favorite_devices_repository.replace_for_settings_version(
                inserted_settings.id,
                [
                    FavoriteDeviceSnapshotRow(
                        home_id=home_id,
                        settings_version_id=inserted_settings.id,
                        device_id=favorite["device_id"],
                        selected=bool(favorite.get("selected", True)),
                        favorite_order=favorite.get("favorite_order"),
                    )
                    for favorite in settings_snapshot.get("favorites", [])
                ],
                ctx=ctx,
            )

            inserted_layout = await self._layout_version_repository.insert(
                NewLayoutVersionRow(
                    home_id=home_id,
                    layout_version=next_layout_version,
                    background_asset_id=layout_snapshot.get("background_asset_id"),
                    layout_meta_json=layout_snapshot.get("layout_meta", {}),
                    effective_at=now_iso,
                    published_by_member_id=operator_id,
                    published_by_terminal_id=terminal_id,
                ),
                ctx=ctx,
            )
            await self._layout_hotspot_repository.replace_for_layout_version(
                inserted_layout.id,
                [
                    LayoutHotspotSnapshotRow(
                        layout_version_id=inserted_layout.id,
                        hotspot_id=hotspot["hotspot_id"],
                        device_id=hotspot["device_id"],
                        x=float(hotspot["x"]),
                        y=float(hotspot["y"]),
                        icon_type=hotspot.get("icon_type"),
                        label_mode=hotspot.get("label_mode"),
                        is_visible=bool(hotspot.get("is_visible", True)),
                        structure_order=int(hotspot.get("structure_order", 0)),
                        display_policy=hotspot.get("display_policy"),
                    )
                    for hotspot in layout_snapshot.get("hotspots", [])
                ],
                ctx=ctx,
            )

            await tx.session.execute(
                text(
                    """
                    UPDATE system_backups
                    SET restored_at = :restored_at
                    WHERE home_id = :home_id
                      AND backup_id = :backup_id
                    """
                ),
                {"home_id": home_id, "backup_id": backup_id, "restored_at": now_iso},
            )
            await self._ws_event_outbox_repository.insert(
                NewWsEventOutboxRow(
                    home_id=home_id,
                    event_id=self._event_id_generator.next_event_id(),
                    event_type="backup_restore_completed",
                    change_domain="BACKUP",
                    snapshot_required=True,
                    payload_json={
                        "backup_id": backup_id,
                        "settings_version": next_settings_version,
                        "layout_version": next_layout_version,
                        "effective_at": now_iso,
                        "restored_by_terminal_id": terminal_id,
                    },
                    occurred_at=now_iso,
                ),
                ctx=ctx,
            )

        await self._unit_of_work.run_in_transaction(_transaction)
        return BackupRestoreView(
            restored=True,
            settings_version=next_settings_version,
            layout_version=next_layout_version,
            effective_at=now_iso,
            message="Backup restored successfully",
        )
