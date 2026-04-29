from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone

from src.infrastructure.ha.HaConnectionGateway import HaStateEntry
from src.modules.energy.services.EnergyModels import _is_iso_newer
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

    async def list_bound(self, *_args, **_kwargs):
        return [self.row] if self.row and self.row.binding_status == "BOUND" else []

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
        self.call_service_requests = []

    async def fetch_states(self, *_args, **_kwargs):
        if isinstance(self.states, list) and self.states and isinstance(self.states[0], list):
            if len(self.states) > 1:
                return self.states.pop(0)
            return self.states[0]
        return self.states

    async def call_service(self, home_id, domain, service, payload):
        self.call_service_requests.append((home_id, domain, service, payload))


class _Restarter:
    def __init__(self, should_fail: bool = False, statuses=None):
        self.should_fail = should_fail
        self.statuses = list(statuses or [])
        self.restart_count = 0
        self.fetch_count = 0

    async def restart(self):
        self.restart_count += 1
        if self.should_fail:
            raise RuntimeError("restart failed")

    async def fetch(self):
        self.fetch_count += 1
        if self.should_fail:
            raise RuntimeError("fetch failed")

    async def get_status(self):
        if len(self.statuses) > 1:
            return self.statuses.pop(0)
        if self.statuses:
            return self.statuses[0]
        return None


class _SgccStatus:
    def __init__(self, *, job_state: str, job_kind: str = "FETCH", last_error: str | None = None):
        self.job_state = job_state
        self.job_kind = job_kind
        self.last_error = last_error
        self.job_phase = None


def _state(entity_id: str, value: str, updated_at: str = "2026-04-20T07:58:00+00:00"):
    return HaStateEntry(
        payload={
            "entity_id": entity_id,
            "state": value,
            "last_updated": updated_at,
        }
    )


def _run(coro):
    return asyncio.run(coro)


def test_is_iso_newer_normalizes_database_and_cache_timestamp_formats():
    assert (
        _is_iso_newer(
            "2026-04-28T00:52:53.506097",
            "2026-04-28 00:52:53.506097+00",
        )
        is False
    )
    assert _is_iso_newer("2026-04-28T00:52:54Z", "2026-04-28 00:52:53+00") is True


def _service(
    *,
    accounts=None,
    snapshots=None,
    gateway=None,
    restarter=None,
    mode="none",
    sgcc_cache_file=None,
):
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
        sgcc_container_restarter=restarter,
        upstream_refresh_mode=mode,
        upstream_wait_timeout_seconds=1,
        upstream_poll_interval_seconds=0.01,
        sgcc_cache_file=str(sgcc_cache_file) if sgcc_cache_file else None,
    )
    return service, account_repository, snapshot_repository, outbox_repository


def test_energy_binding_is_normalized_for_sgcc_sidecar():
    service, accounts, _, _ = _service()

    result = _run(
        service.update_binding(
            "home-1",
            "terminal-1",
            {
                "provider": "SGCC_SIDECAR",
                "account_id": " 1234567890 ",
                "entity_map": {"balance": " sensor.custom_balance "},
                "ignored": "value",
            },
            "member-1",
        )
    )

    assert result.binding_status == "BOUND"
    assert accounts.upserts[0].account_payload_encrypted
    assert "sensor.custom_balance" in accounts.upserts[0].account_payload_encrypted
    view = _run(service.get_energy("home-1"))
    assert view.provider == "SGCC_SIDECAR"
    assert view.account_id_masked == "12******90"
    assert view.entity_map == {"balance": "sensor.custom_balance"}


def test_energy_binding_accepts_legacy_home_assistant_sgcc_provider():
    service, accounts, _, _ = _service()

    result = _run(
        service.update_binding(
            "home-1",
            "terminal-1",
            {
                "provider": "HOME_ASSISTANT_SGCC",
                "account_id": "1234567890",
            },
        )
    )

    assert result.binding_status == "BOUND"
    assert '"provider": "SGCC_SIDECAR"' in accounts.upserts[0].account_payload_encrypted
    view = _run(service.get_energy("home-1"))
    assert view.provider == "SGCC_SIDECAR"


def test_energy_refresh_reads_default_state_grid_entities_from_ha():
    states = [
        _state("sensor.last_electricity_usage_1234567890", "1.23"),
        _state("sensor.month_electricity_usage_1234567890", "45.6"),
        _state("sensor.electricity_charge_balance_1234567890", "78.9"),
        _state("sensor.yearly_electricity_usage_1234567890", "345.67"),
    ]
    service, _, snapshots, outbox = _service(gateway=_HaGateway(states))
    _run(service.update_binding("home-1", "terminal-1", {"account_id": "1234567890"}))

    result = _run(service.refresh("home-1", "terminal-1"))

    assert result.refresh_status == "SUCCESS"
    assert snapshots.inserts[-1].yesterday_usage == 1.23
    assert snapshots.inserts[-1].monthly_usage == 45.6
    assert snapshots.inserts[-1].balance == 78.9
    assert snapshots.inserts[-1].yearly_usage == 345.67
    assert snapshots.inserts[-1].cache_mode is False
    assert outbox.events[-1].event_type == "energy_refresh_completed"


def test_energy_refresh_prefers_manual_entity_map_over_account_suffix():
    states = [
        _state("sensor.manual_yesterday", "2.5"),
        _state("sensor.month_electricity_usage_1234567890", "40"),
        _state("sensor.electricity_charge_balance_1234567890", "80"),
        _state("sensor.yearly_electricity_usage_1234567890", "300"),
    ]
    service, _, snapshots, _ = _service(gateway=_HaGateway(states))
    _run(
        service.update_binding(
            "home-1",
            "terminal-1",
            {
                "account_id": "1234567890",
                "entity_map": {"yesterday_usage": "sensor.manual_yesterday"},
            },
        )
    )

    _run(service.refresh("home-1", "terminal-1"))

    assert snapshots.inserts[-1].refresh_status == "SUCCESS"
    assert snapshots.inserts[-1].yesterday_usage == 2.5


def test_energy_refresh_auto_discovers_single_sgcc_suffix_from_states():
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

    result = _run(service.refresh("home-1", "terminal-1"))

    assert result.refresh_status == "SUCCESS"
    assert snapshots.inserts[-1].yesterday_usage == 2.1
    assert snapshots.inserts[-1].monthly_usage == 42.0
    assert snapshots.inserts[-1].balance == 66.5
    assert snapshots.inserts[-1].yearly_usage == 388.0


def test_energy_refresh_falls_back_to_sgcc_cache_when_ha_entities_are_missing(tmp_path):
    cache_file = tmp_path / "sgcc_cache.json"
    cache_file.write_text(
        json.dumps(
            {
                "1503525238170": {
                    "balance": 176.67,
                    "last_daily_usage": 4.46,
                    "yearly_usage": "523",
                    "month_usage": "194",
                    "timestamp": "2026-04-23T11:41:57.719419",
                }
            }
        ),
        encoding="utf-8",
    )
    restarter = _Restarter()
    service, _, snapshots, outbox = _service(
        gateway=_HaGateway([[], []]),
        restarter=restarter,
        mode="sgcc_sidecar",
        sgcc_cache_file=cache_file,
    )
    _run(
        service.update_binding(
            "home-1",
            "terminal-1",
            {
                "account_id": "1503525238170",
                "entity_map": {
                    "yesterday_usage": "sensor.last_electricity_usage_8170",
                    "monthly_usage": "sensor.month_electricity_usage_8170",
                    "balance": "sensor.electricity_charge_balance_8170",
                    "yearly_usage": "sensor.yearly_electricity_usage_8170",
                },
            },
        )
    )

    result = _run(service.refresh("home-1", "terminal-1"))

    assert restarter.fetch_count == 1
    assert result.refresh_status == "SUCCESS"
    assert result.refresh_status_detail == "SUCCESS_UPDATED"
    assert result.source_updated is True
    assert snapshots.inserts[-1].cache_mode is True
    assert snapshots.inserts[-1].yesterday_usage == 4.46
    assert snapshots.inserts[-1].monthly_usage == 194.0
    assert snapshots.inserts[-1].yearly_usage == 523.0
    assert snapshots.inserts[-1].balance == 176.67
    assert snapshots.inserts[-1].source_updated_at == "2026-04-23T11:41:57.719419"
    assert outbox.events[-1].event_type == "energy_refresh_completed"


def test_energy_refresh_failure_keeps_previous_values_as_cache():
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
    _run(service.update_binding("home-1", "terminal-1", {"account_id": "1234567890"}))

    result = _run(service.refresh("home-1", "terminal-1"))

    assert result.refresh_status == "FAILED"
    assert snapshots.inserts[-1].cache_mode is True
    assert snapshots.inserts[-1].last_error_code == "HA_NOT_CONFIGURED"
    assert snapshots.inserts[-1].balance == 66.0
    assert outbox.events[-1].event_type == "energy_refresh_failed"


def test_energy_auto_refresh_all_bound_accounts_uses_internal_refresh_path():
    states = [
        _state("sensor.last_electricity_usage_1234567890", "1.23"),
        _state("sensor.month_electricity_usage_1234567890", "45.6"),
        _state("sensor.electricity_charge_balance_1234567890", "78.9"),
        _state("sensor.yearly_electricity_usage_1234567890", "345.67"),
    ]
    service, accounts, snapshots, outbox = _service(gateway=_HaGateway(states))
    _run(service.update_binding("home-1", "terminal-1", {"account_id": "1234567890"}))

    result = _run(service.refresh_all_bound_accounts())

    assert result.refreshed_count == 1
    assert result.success_count == 1
    assert result.failed_count == 0
    assert snapshots.inserts[-1].refresh_status == "SUCCESS"
    assert snapshots.inserts[-1].monthly_usage == 45.6
    assert outbox.events[-1].event_type == "energy_refresh_completed"


def test_energy_refresh_restarts_sgcc_and_reports_stale_source_when_timestamp_does_not_change():
    states = [
        [
            _state("sensor.last_electricity_usage_1234567890", "1.23", "2026-04-20T07:58:00+00:00"),
            _state("sensor.month_electricity_usage_1234567890", "45.6", "2026-04-20T07:58:00+00:00"),
            _state("sensor.electricity_charge_balance_1234567890", "78.9", "2026-04-20T07:58:00+00:00"),
            _state("sensor.yearly_electricity_usage_1234567890", "345.67", "2026-04-20T07:58:00+00:00"),
        ],
        [
            _state("sensor.last_electricity_usage_1234567890", "1.23", "2026-04-20T07:58:00+00:00"),
            _state("sensor.month_electricity_usage_1234567890", "45.6", "2026-04-20T07:58:00+00:00"),
            _state("sensor.electricity_charge_balance_1234567890", "78.9", "2026-04-20T07:58:00+00:00"),
            _state("sensor.yearly_electricity_usage_1234567890", "345.67", "2026-04-20T07:58:00+00:00"),
        ],
    ]
    restarter = _Restarter()
    service, _, snapshots, _ = _service(
        gateway=_HaGateway(states),
        restarter=restarter,
        mode="docker_restart",
    )
    _run(service.update_binding("home-1", "terminal-1", {"account_id": "1234567890"}))

    result = _run(service.refresh("home-1", "terminal-1"))

    assert restarter.restart_count == 1
    assert result.refresh_status == "SUCCESS"
    assert result.refresh_status_detail == "SUCCESS_STALE_SOURCE"
    assert result.source_updated is False
    assert snapshots.inserts[-1].last_error_code == "SOURCE_NOT_UPDATED"


def test_energy_refresh_restarts_sgcc_and_reports_updated_source_when_timestamp_advances():
    states = [
        [
            _state("sensor.last_electricity_usage_1234567890", "1.23", "2026-04-20T07:58:00+00:00"),
            _state("sensor.month_electricity_usage_1234567890", "45.6", "2026-04-20T07:58:00+00:00"),
            _state("sensor.electricity_charge_balance_1234567890", "78.9", "2026-04-20T07:58:00+00:00"),
            _state("sensor.yearly_electricity_usage_1234567890", "345.67", "2026-04-20T07:58:00+00:00"),
        ],
        [
            _state("sensor.last_electricity_usage_1234567890", "2.00", "2026-04-20T08:05:00+00:00"),
            _state("sensor.month_electricity_usage_1234567890", "46.0", "2026-04-20T08:05:00+00:00"),
            _state("sensor.electricity_charge_balance_1234567890", "77.9", "2026-04-20T08:05:00+00:00"),
            _state("sensor.yearly_electricity_usage_1234567890", "346.00", "2026-04-20T08:05:00+00:00"),
        ],
    ]
    restarter = _Restarter()
    service, _, snapshots, _ = _service(
        gateway=_HaGateway(states),
        restarter=restarter,
        mode="docker_restart",
    )
    _run(service.update_binding("home-1", "terminal-1", {"account_id": "1234567890"}))

    result = _run(service.refresh("home-1", "terminal-1"))

    assert restarter.restart_count == 1
    assert result.refresh_status == "SUCCESS"
    assert result.refresh_status_detail == "SUCCESS_UPDATED"
    assert result.source_updated is True
    assert snapshots.inserts[-1].monthly_usage == 46.0


def test_energy_refresh_execs_sgcc_fetch_and_reports_updated_source_when_timestamp_advances():
    states = [
        [
            _state("sensor.last_electricity_usage_1234567890", "1.23", "2026-04-20T07:58:00+00:00"),
            _state("sensor.month_electricity_usage_1234567890", "45.6", "2026-04-20T07:58:00+00:00"),
            _state("sensor.electricity_charge_balance_1234567890", "78.9", "2026-04-20T07:58:00+00:00"),
            _state("sensor.yearly_electricity_usage_1234567890", "345.67", "2026-04-20T07:58:00+00:00"),
        ],
        [
            _state("sensor.last_electricity_usage_1234567890", "2.00", "2026-04-20T08:05:00+00:00"),
            _state("sensor.month_electricity_usage_1234567890", "46.0", "2026-04-20T08:05:00+00:00"),
            _state("sensor.electricity_charge_balance_1234567890", "77.9", "2026-04-20T08:05:00+00:00"),
            _state("sensor.yearly_electricity_usage_1234567890", "346.00", "2026-04-20T08:05:00+00:00"),
        ],
    ]
    restarter = _Restarter()
    service, _, snapshots, _ = _service(
        gateway=_HaGateway(states),
        restarter=restarter,
        mode="docker_exec_fetch",
    )
    _run(service.update_binding("home-1", "terminal-1", {"account_id": "1234567890"}))

    result = _run(service.refresh("home-1", "terminal-1"))

    assert restarter.restart_count == 0
    assert restarter.fetch_count == 1
    assert result.refresh_status == "SUCCESS"
    assert result.refresh_status_detail == "SUCCESS_UPDATED"
    assert result.source_updated is True
    assert snapshots.inserts[-1].monthly_usage == 46.0


def test_energy_refresh_uses_sgcc_sidecar_fetch_mode():
    states = [
        [
            _state("sensor.last_electricity_usage_1234567890", "1.23", "2026-04-20T07:58:00+00:00"),
            _state("sensor.month_electricity_usage_1234567890", "45.6", "2026-04-20T07:58:00+00:00"),
            _state("sensor.electricity_charge_balance_1234567890", "78.9", "2026-04-20T07:58:00+00:00"),
            _state("sensor.yearly_electricity_usage_1234567890", "345.67", "2026-04-20T07:58:00+00:00"),
        ],
        [
            _state("sensor.last_electricity_usage_1234567890", "2.00", "2026-04-20T08:05:00+00:00"),
            _state("sensor.month_electricity_usage_1234567890", "46.0", "2026-04-20T08:05:00+00:00"),
            _state("sensor.electricity_charge_balance_1234567890", "77.9", "2026-04-20T08:05:00+00:00"),
            _state("sensor.yearly_electricity_usage_1234567890", "346.00", "2026-04-20T08:05:00+00:00"),
        ],
    ]
    restarter = _Restarter()
    service, _, snapshots, _ = _service(
        gateway=_HaGateway(states),
        restarter=restarter,
        mode="sgcc_sidecar",
    )
    _run(service.update_binding("home-1", "terminal-1", {"account_id": "1234567890"}))

    result = _run(service.refresh("home-1", "terminal-1"))

    assert restarter.restart_count == 0
    assert restarter.fetch_count == 1
    assert result.refresh_status == "SUCCESS"
    assert result.refresh_status_detail == "SUCCESS_UPDATED"
    assert snapshots.inserts[-1].monthly_usage == 46.0


def test_energy_refresh_reports_sgcc_sidecar_login_required_without_waiting_for_timeout():
    states = [
        _state("sensor.last_electricity_usage_1234567890", "1.23", "2026-04-20T07:58:00+00:00"),
        _state("sensor.month_electricity_usage_1234567890", "45.6", "2026-04-20T07:58:00+00:00"),
        _state("sensor.electricity_charge_balance_1234567890", "78.9", "2026-04-20T07:58:00+00:00"),
        _state("sensor.yearly_electricity_usage_1234567890", "345.67", "2026-04-20T07:58:00+00:00"),
    ]
    restarter = _Restarter(statuses=[_SgccStatus(job_state="FAILED", last_error="LOGIN_REQUIRED")])
    service, _, snapshots, _ = _service(
        gateway=_HaGateway(states),
        restarter=restarter,
        mode="sgcc_sidecar",
    )
    _run(service.update_binding("home-1", "terminal-1", {"account_id": "1234567890"}))

    result = _run(service.refresh("home-1", "terminal-1"))

    assert restarter.fetch_count == 1
    assert result.refresh_status == "FAILED"
    assert snapshots.inserts[-1].last_error_code == "LOGIN_REQUIRED"
