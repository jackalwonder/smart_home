from __future__ import annotations

from datetime import datetime, timezone

import pytest

from src.infrastructure.ha.HaConnectionGateway import HaStateEntry
from src.modules.energy.services.EnergyService import EnergyService
from src.repositories.base.energy.EnergyAccountRepository import (
    EnergyAccountRow,
    EnergyAccountUpsertRow,
)
from src.repositories.base.energy.EnergySnapshotRepository import (
    EnergySnapshotRow,
    NewEnergySnapshotRow,
)


class _Clock:
    def now(self):
        return datetime(2026, 4, 20, 8, 0, 0, tzinfo=timezone.utc)


class _PinGuard:
    async def require_active_session(self, *_args, **_kwargs):
        return None


class _EventIdGenerator:
    def next_event_id(self):
        return "event-1"


class _EnergyAccountRepository:
    def __init__(self):
        self.row: EnergyAccountRow | None = None
        self.upserts: list[EnergyAccountUpsertRow] = []

    async def find_by_home_id(self, *_args, **_kwargs):
        return self.row

    async def upsert(self, input, *_args, **_kwargs):
        self.upserts.append(input)
        self.row = EnergyAccountRow(
            id="energy-account-1",
            home_id=input.home_id,
            binding_status=input.binding_status,
            account_payload_encrypted=input.account_payload_encrypted,
            updated_at="2026-04-20T08:00:00+00:00",
        )
        return self.row


class _EnergySnapshotRepository:
    def __init__(self, latest: EnergySnapshotRow | None = None):
        self.latest = latest
        self.inserts: list[NewEnergySnapshotRow] = []

    async def find_latest_by_home_id(self, *_args, **_kwargs):
        return self.latest

    async def insert(self, input, *_args, **_kwargs):
        self.inserts.append(input)
        self.latest = EnergySnapshotRow(
            id=f"snapshot-{len(self.inserts)}",
            home_id=input.home_id,
            binding_status=input.binding_status,
            refresh_status=input.refresh_status,
            yesterday_usage=input.yesterday_usage,
            monthly_usage=input.monthly_usage,
            yearly_usage=input.yearly_usage,
            balance=input.balance,
            cache_mode=input.cache_mode,
            last_error_code=input.last_error_code,
            source_updated_at=input.source_updated_at,
            created_at="2026-04-20T08:00:00+00:00",
        )
        return self.latest


class _OutboxRepository:
    def __init__(self):
        self.events = []

    async def insert(self, input, *_args, **_kwargs):
        self.events.append(input)


class _HaGateway:
    def __init__(self, states):
        self.states = states

    async def fetch_states(self, *_args, **_kwargs):
        return self.states


def _state(entity_id: str, value: str, updated_at: str = "2026-04-20T07:58:00+00:00"):
    return HaStateEntry(
        payload={
            "entity_id": entity_id,
            "state": value,
            "last_updated": updated_at,
        }
    )


def _service(*, accounts=None, snapshots=None, gateway=None):
    account_repository = accounts or _EnergyAccountRepository()
    snapshot_repository = snapshots or _EnergySnapshotRepository()
    outbox_repository = _OutboxRepository()
    service = EnergyService(
        energy_account_repository=account_repository,
        energy_snapshot_repository=snapshot_repository,
        ws_event_outbox_repository=outbox_repository,
        management_pin_guard=_PinGuard(),
        ha_connection_gateway=gateway or _HaGateway([]),
        event_id_generator=_EventIdGenerator(),
        clock=_Clock(),
    )
    return service, account_repository, snapshot_repository, outbox_repository


@pytest.mark.asyncio
async def test_energy_binding_is_normalized_for_home_assistant_sgcc():
    service, accounts, _, _ = _service()

    result = await service.update_binding(
        "home-1",
        "terminal-1",
        {
            "provider": "HOME_ASSISTANT_SGCC",
            "account_id": " 1234567890 ",
            "entity_map": {"balance": " sensor.custom_balance "},
            "ignored": "value",
        },
        "member-1",
    )

    assert result.binding_status == "BOUND"
    assert accounts.upserts[0].account_payload_encrypted
    assert "sensor.custom_balance" in accounts.upserts[0].account_payload_encrypted
    view = await service.get_energy("home-1")
    assert view.provider == "HOME_ASSISTANT_SGCC"
    assert view.account_id_masked == "12******90"
    assert view.entity_map == {"balance": "sensor.custom_balance"}


@pytest.mark.asyncio
async def test_energy_refresh_reads_default_state_grid_entities_from_ha():
    states = [
        _state("sensor.last_electricity_usage_1234567890", "1.23"),
        _state("sensor.month_electricity_usage_1234567890", "45.6"),
        _state("sensor.electricity_charge_balance_1234567890", "78.9"),
        _state("sensor.yearly_electricity_usage_1234567890", "345.67"),
    ]
    service, _, snapshots, outbox = _service(gateway=_HaGateway(states))
    await service.update_binding("home-1", "terminal-1", {"account_id": "1234567890"})

    result = await service.refresh("home-1", "terminal-1")

    assert result.refresh_status == "SUCCESS"
    assert snapshots.inserts[-1].yesterday_usage == 1.23
    assert snapshots.inserts[-1].monthly_usage == 45.6
    assert snapshots.inserts[-1].balance == 78.9
    assert snapshots.inserts[-1].yearly_usage == 345.67
    assert snapshots.inserts[-1].cache_mode is False
    assert outbox.events[-1].event_type == "energy_refresh_completed"


@pytest.mark.asyncio
async def test_energy_refresh_prefers_manual_entity_map_over_account_suffix():
    states = [
        _state("sensor.manual_yesterday", "2.5"),
        _state("sensor.month_electricity_usage_1234567890", "40"),
        _state("sensor.electricity_charge_balance_1234567890", "80"),
        _state("sensor.yearly_electricity_usage_1234567890", "300"),
    ]
    service, _, snapshots, _ = _service(gateway=_HaGateway(states))
    await service.update_binding(
        "home-1",
        "terminal-1",
        {
            "account_id": "1234567890",
            "entity_map": {"yesterday_usage": "sensor.manual_yesterday"},
        },
    )

    await service.refresh("home-1", "terminal-1")

    assert snapshots.inserts[-1].refresh_status == "SUCCESS"
    assert snapshots.inserts[-1].yesterday_usage == 2.5


@pytest.mark.asyncio
async def test_energy_refresh_auto_discovers_single_sgcc_suffix_from_states():
    states = [
        _state("sensor.last_electricity_usage_83920123", "2.1"),
        _state("sensor.month_electricity_usage_83920123", "42"),
        _state("sensor.electricity_charge_balance_83920123", "66.5"),
        _state("sensor.yearly_electricity_usage_83920123", "388"),
    ]
    service, accounts, snapshots, _ = _service(gateway=_HaGateway(states))
    accounts.row = EnergyAccountRow(
        id="energy-account-1",
        home_id="home-1",
        binding_status="BOUND",
        account_payload_encrypted='{"account":"demo"}',
        updated_at="2026-04-20T08:00:00+00:00",
    )

    result = await service.refresh("home-1", "terminal-1")

    assert result.refresh_status == "SUCCESS"
    assert snapshots.inserts[-1].yesterday_usage == 2.1
    assert snapshots.inserts[-1].monthly_usage == 42.0
    assert snapshots.inserts[-1].balance == 66.5
    assert snapshots.inserts[-1].yearly_usage == 388.0


@pytest.mark.asyncio
async def test_energy_refresh_failure_keeps_previous_values_as_cache():
    previous = EnergySnapshotRow(
        id="previous",
        home_id="home-1",
        binding_status="BOUND",
        refresh_status="SUCCESS",
        yesterday_usage=1.0,
        monthly_usage=20.0,
        yearly_usage=200.0,
        balance=66.0,
        cache_mode=False,
        last_error_code=None,
        source_updated_at="2026-04-19T08:00:00+00:00",
        created_at="2026-04-19T08:00:00+00:00",
    )
    snapshots = _EnergySnapshotRepository(previous)
    service, _, _, outbox = _service(snapshots=snapshots, gateway=_HaGateway(None))
    await service.update_binding("home-1", "terminal-1", {"account_id": "1234567890"})

    result = await service.refresh("home-1", "terminal-1")

    assert result.refresh_status == "FAILED"
    assert snapshots.inserts[-1].cache_mode is True
    assert snapshots.inserts[-1].last_error_code == "HA_NOT_CONFIGURED"
    assert snapshots.inserts[-1].balance == 66.0
    assert outbox.events[-1].event_type == "energy_refresh_failed"
