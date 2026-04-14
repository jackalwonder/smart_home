from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from src.repositories.base.realtime.WsEventOutboxRepository import NewWsEventOutboxRow, WsEventOutboxRepository
from src.repositories.base.settings.FavoriteDevicesRepository import (
    FavoriteDeviceSnapshotRow,
    FavoriteDevicesRepository,
)
from src.repositories.base.settings.FunctionSettingsRepository import (
    FunctionSettingsRepository,
    FunctionSettingsSnapshotRow,
)
from src.repositories.base.settings.PageSettingsRepository import (
    PageSettingsRepository,
    PageSettingsSnapshotRow,
)
from src.repositories.base.settings.SettingsVersionRepository import (
    NewSettingsVersionRow,
    SettingsVersionRepository,
)
from src.modules.auth.services.guard.ManagementPinGuard import ManagementPinGuard
from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode
from src.shared.kernel.Clock import Clock
from src.shared.kernel.EventIdGenerator import EventIdGenerator
from src.shared.kernel.RepoContext import RepoContext
from src.shared.kernel.UnitOfWork import UnitOfWork
from src.shared.kernel.VersionTokenGenerator import VersionTokenGenerator


@dataclass(frozen=True)
class SettingsSaveInput:
    home_id: str
    settings_version: str | None
    page_settings: dict[str, Any]
    function_settings: dict[str, Any]
    favorites: list[dict[str, Any]]
    terminal_id: str | None = None
    member_id: str | None = None


@dataclass(frozen=True)
class SettingsSaveView:
    saved: bool
    settings_version: str
    updated_domains: list[str]
    effective_at: str


class SettingsSaveService:
    def __init__(
        self,
        unit_of_work: UnitOfWork,
        settings_version_repository: SettingsVersionRepository,
        favorite_devices_repository: FavoriteDevicesRepository,
        page_settings_repository: PageSettingsRepository,
        function_settings_repository: FunctionSettingsRepository,
        ws_event_outbox_repository: WsEventOutboxRepository,
        management_pin_guard: ManagementPinGuard,
        version_token_generator: VersionTokenGenerator,
        event_id_generator: EventIdGenerator,
        clock: Clock,
    ) -> None:
        self._unit_of_work = unit_of_work
        self._settings_version_repository = settings_version_repository
        self._favorite_devices_repository = favorite_devices_repository
        self._page_settings_repository = page_settings_repository
        self._function_settings_repository = function_settings_repository
        self._ws_event_outbox_repository = ws_event_outbox_repository
        self._management_pin_guard = management_pin_guard
        self._version_token_generator = version_token_generator
        self._event_id_generator = event_id_generator
        self._clock = clock

    async def save(self, input: SettingsSaveInput) -> SettingsSaveView:
        if input.terminal_id is None:
            raise AppError(
                ErrorCode.INVALID_PARAMS,
                "terminal_id is required",
                details={"fields": [{"field": "terminal_id", "reason": "required"}]},
            )
        await self._management_pin_guard.require_active_session(input.home_id, input.terminal_id)
        current = await self._settings_version_repository.find_current_by_home(input.home_id)
        current_version = current.settings_version if current is not None else None
        if input.settings_version != current_version:
            raise AppError(
                ErrorCode.VERSION_CONFLICT,
                "settings_version does not match current effective version",
            )

        next_settings_version = self._version_token_generator.next_settings_version()
        now_iso = self._clock.now().isoformat()

        async def _transaction(tx) -> None:
            ctx = RepoContext(tx=tx)
            inserted = await self._settings_version_repository.insert(
                NewSettingsVersionRow(
                    home_id=input.home_id,
                    settings_version=next_settings_version,
                    updated_domains_json=["favorites", "page_settings", "function_settings"],
                    effective_at=now_iso,
                    saved_by_member_id=input.member_id,
                    saved_by_terminal_id=input.terminal_id,
                ),
                ctx=ctx,
            )
            await self._page_settings_repository.upsert_for_settings_version(
                PageSettingsSnapshotRow(
                    home_id=input.home_id,
                    settings_version_id=inserted.id,
                    room_label_mode=input.page_settings.get("room_label_mode", "ROOM_NAME"),
                    homepage_display_policy_json=input.page_settings.get(
                        "homepage_display_policy", {}
                    ),
                    icon_policy_json=input.page_settings.get("icon_policy", {}),
                    layout_preference_json=input.page_settings.get("layout_preference", {}),
                ),
                ctx=ctx,
            )
            await self._function_settings_repository.upsert_for_settings_version(
                FunctionSettingsSnapshotRow(
                    home_id=input.home_id,
                    settings_version_id=inserted.id,
                    low_battery_threshold=float(
                        input.function_settings.get("low_battery_threshold", 20)
                    ),
                    offline_threshold_seconds=int(
                        input.function_settings.get("offline_threshold_seconds", 300)
                    ),
                    quick_entry_policy_json=input.function_settings.get(
                        "quick_entry_policy", {}
                    ),
                    music_enabled=bool(input.function_settings.get("music_enabled", False)),
                    favorite_limit=int(input.function_settings.get("favorite_limit", 8)),
                    auto_home_timeout_seconds=int(
                        input.function_settings.get("auto_home_timeout_seconds", 30)
                    ),
                    position_device_thresholds_json=input.function_settings.get(
                        "position_device_thresholds", {}
                    ),
                ),
                ctx=ctx,
            )
            await self._favorite_devices_repository.replace_for_settings_version(
                inserted.id,
                [
                    FavoriteDeviceSnapshotRow(
                        home_id=input.home_id,
                        settings_version_id=inserted.id,
                        device_id=favorite["device_id"],
                        selected=bool(favorite.get("selected", True)),
                        favorite_order=favorite.get("favorite_order"),
                    )
                    for favorite in input.favorites
                ],
                ctx=ctx,
            )
            await self._ws_event_outbox_repository.insert(
                NewWsEventOutboxRow(
                    home_id=input.home_id,
                    event_id=self._event_id_generator.next_event_id(),
                    event_type="settings_updated",
                    change_domain="SETTINGS",
                    snapshot_required=True,
                    payload_json={
                        "settings_version": next_settings_version,
                        "updated_domains": ["FAVORITES", "PAGE_SETTINGS", "FUNCTION_SETTINGS"],
                        "effective_at": now_iso,
                    },
                    occurred_at=now_iso,
                ),
                ctx=ctx,
            )

        await self._unit_of_work.run_in_transaction(_transaction)
        return SettingsSaveView(
            saved=True,
            settings_version=next_settings_version,
            updated_domains=["FAVORITES", "PAGE_SETTINGS", "FUNCTION_SETTINGS"],
            effective_at=now_iso,
        )
