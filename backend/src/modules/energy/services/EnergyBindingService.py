from __future__ import annotations

import json

from src.modules.auth.services.guard.ManagementPinGuard import ManagementPinGuard
from src.modules.energy.services.EnergyModels import (
    EnergyBindingView,
    EnergyView,
    _decode_binding_payload,
    _derive_refresh_status_detail,
    _mask_account_id,
    _normalize_binding_payload,
)
from src.repositories.base.energy.EnergyAccountRepository import (
    EnergyAccountRepository,
    EnergyAccountUpsertRow,
)
from src.repositories.base.energy.EnergySnapshotRepository import EnergySnapshotRepository


class EnergyBindingService:
    def __init__(
        self,
        energy_account_repository: EnergyAccountRepository,
        energy_snapshot_repository: EnergySnapshotRepository,
        management_pin_guard: ManagementPinGuard,
    ) -> None:
        self._energy_account_repository = energy_account_repository
        self._energy_snapshot_repository = energy_snapshot_repository
        self._management_pin_guard = management_pin_guard

    async def get_energy(self, home_id: str) -> EnergyView:
        account = await self._energy_account_repository.find_by_home_id(home_id)
        snapshot = await self._energy_snapshot_repository.find_latest_by_home_id(home_id)
        binding_payload = _decode_binding_payload(account.account_payload_encrypted if account else None)
        return EnergyView(
            binding_status=account.binding_status if account else "UNBOUND",
            refresh_status=snapshot.refresh_status if snapshot else None,
            yesterday_usage=snapshot.yesterday_usage if snapshot else None,
            monthly_usage=snapshot.monthly_usage if snapshot else None,
            balance=snapshot.balance if snapshot else None,
            yearly_usage=snapshot.yearly_usage if snapshot else None,
            updated_at=snapshot.created_at if snapshot else None,
            system_updated_at=snapshot.created_at if snapshot else None,
            source_updated_at=snapshot.source_updated_at if snapshot else None,
            cache_mode=snapshot.cache_mode if snapshot else False,
            last_error_code=snapshot.last_error_code if snapshot else None,
            refresh_status_detail=_derive_refresh_status_detail(snapshot) if snapshot else None,
            provider=binding_payload.provider,
            account_id_masked=_mask_account_id(binding_payload.account_id),
            entity_map=binding_payload.entity_map,
        )

    async def update_binding(
        self,
        home_id: str,
        terminal_id: str,
        payload: dict,
        member_id: str | None = None,
    ) -> EnergyBindingView:
        await self._management_pin_guard.require_active_session(home_id, terminal_id)
        binding_payload = _normalize_binding_payload(payload)
        row = await self._energy_account_repository.upsert(
            EnergyAccountUpsertRow(
                home_id=home_id,
                binding_status="BOUND",
                account_payload_encrypted=json.dumps(binding_payload.to_json(), ensure_ascii=True),
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
