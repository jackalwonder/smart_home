from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime

from src.modules.auth.services.guard.ManagementPinGuard import ManagementPinGuard
from src.repositories.base.energy.EnergyAccountRepository import EnergyAccountRepository, EnergyAccountUpsertRow
from src.repositories.base.energy.EnergySnapshotRepository import EnergySnapshotRepository, NewEnergySnapshotRow
from src.repositories.base.realtime.WsEventOutboxRepository import NewWsEventOutboxRow, WsEventOutboxRepository
from src.shared.kernel.Clock import Clock
from src.shared.kernel.EventIdGenerator import EventIdGenerator


@dataclass(frozen=True)
class EnergyView:
    binding_status: str
    refresh_status: str | None
    yesterday_usage: float | None
    monthly_usage: float | None
    balance: float | None
    yearly_usage: float | None
    updated_at: str | None
    cache_mode: bool
    last_error_code: str | None


@dataclass(frozen=True)
class EnergyBindingView:
    saved: bool
    binding_status: str
    updated_at: str
    message: str


@dataclass(frozen=True)
class EnergyRefreshView:
    accepted: bool
    refresh_status: str
    started_at: str
    timeout_seconds: int


class EnergyService:
    def __init__(
        self,
        energy_account_repository: EnergyAccountRepository,
        energy_snapshot_repository: EnergySnapshotRepository,
        ws_event_outbox_repository: WsEventOutboxRepository,
        management_pin_guard: ManagementPinGuard,
        event_id_generator: EventIdGenerator,
        clock: Clock,
    ) -> None:
        self._energy_account_repository = energy_account_repository
        self._energy_snapshot_repository = energy_snapshot_repository
        self._ws_event_outbox_repository = ws_event_outbox_repository
        self._management_pin_guard = management_pin_guard
        self._event_id_generator = event_id_generator
        self._clock = clock

    async def get_energy(self, home_id: str) -> EnergyView:
        account = await self._energy_account_repository.find_by_home_id(home_id)
        snapshot = await self._energy_snapshot_repository.find_latest_by_home_id(home_id)
        return EnergyView(
            binding_status=account.binding_status if account else "UNBOUND",
            refresh_status=snapshot.refresh_status if snapshot else None,
            yesterday_usage=snapshot.yesterday_usage if snapshot else None,
            monthly_usage=snapshot.monthly_usage if snapshot else None,
            balance=snapshot.balance if snapshot else None,
            yearly_usage=snapshot.yearly_usage if snapshot else None,
            updated_at=(snapshot.source_updated_at or snapshot.created_at) if snapshot else None,
            cache_mode=snapshot.cache_mode if snapshot else False,
            last_error_code=snapshot.last_error_code if snapshot else None,
        )

    async def update_binding(
        self,
        home_id: str,
        terminal_id: str,
        payload: dict,
        member_id: str | None = None,
    ) -> EnergyBindingView:
        await self._management_pin_guard.require_active_session(home_id, terminal_id)
        row = await self._energy_account_repository.upsert(
            EnergyAccountUpsertRow(
                home_id=home_id,
                binding_status="BOUND",
                account_payload_encrypted=json.dumps(payload, ensure_ascii=True),
                updated_by_member_id=member_id,
                updated_by_terminal_id=terminal_id,
            )
        )
        return EnergyBindingView(
            saved=True,
            binding_status=row.binding_status,
            updated_at=row.updated_at,
            message="Energy binding saved",
        )

    async def delete_binding(
        self,
        home_id: str,
        terminal_id: str,
        member_id: str | None = None,
    ) -> EnergyBindingView:
        await self._management_pin_guard.require_active_session(home_id, terminal_id)
        row = await self._energy_account_repository.upsert(
            EnergyAccountUpsertRow(
                home_id=home_id,
                binding_status="UNBOUND",
                account_payload_encrypted=None,
                updated_by_member_id=member_id,
                updated_by_terminal_id=terminal_id,
            )
        )
        return EnergyBindingView(
            saved=True,
            binding_status=row.binding_status,
            updated_at=row.updated_at,
            message="Energy binding cleared",
        )

    async def refresh(self, home_id: str, terminal_id: str) -> EnergyRefreshView:
        await self._management_pin_guard.require_active_session(home_id, terminal_id)
        started_at = self._clock.now().isoformat()
        account = await self._energy_account_repository.find_by_home_id(home_id)
        binding_status = account.binding_status if account else "UNBOUND"
        snapshot = await self._energy_snapshot_repository.insert(
            NewEnergySnapshotRow(
                home_id=home_id,
                binding_status=binding_status,
                refresh_status="SUCCESS" if binding_status == "BOUND" else "FAILED",
                yesterday_usage=1.2 if binding_status == "BOUND" else None,
                monthly_usage=24.6 if binding_status == "BOUND" else None,
                yearly_usage=234.5 if binding_status == "BOUND" else None,
                balance=88.8 if binding_status == "BOUND" else None,
                cache_mode=False,
                last_error_code=None if binding_status == "BOUND" else "UNBOUND",
                source_updated_at=datetime.utcnow().isoformat(),
            )
        )
        await self._ws_event_outbox_repository.insert(
            NewWsEventOutboxRow(
                home_id=home_id,
                event_id=self._event_id_generator.next_event_id(),
                event_type="energy_refresh_completed" if binding_status == "BOUND" else "energy_refresh_failed",
                change_domain="ENERGY",
                snapshot_required=False,
                payload_json={"refresh_status": snapshot.refresh_status},
                occurred_at=self._clock.now().isoformat(),
            )
        )
        return EnergyRefreshView(
            accepted=True,
            refresh_status=snapshot.refresh_status,
            started_at=started_at,
            timeout_seconds=30,
        )
