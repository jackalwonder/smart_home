from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from src.infrastructure.ha.HaConnectionGateway import HaStateEntry
from src.modules.settings.services.query.SgccLoginQrCodeService import (
    PNG_SIGNATURE,
    SgccLoginQrCodeService,
)
from src.modules.settings.services.query.SgccRuntimeControlService import (
    SgccRuntimeAccount,
    SgccRuntimeQrCodeStatus,
    SgccRuntimeStatus,
)
from src.repositories.base.energy.EnergyAccountRepository import EnergyAccountRow
from src.shared.errors.AppError import AppError


class FakeRestarter:
    def __init__(self) -> None:
        self.restart_count = 0
        self.fetch_count = 0
        self.runtime_status = None

    async def restart(self) -> None:
        self.restart_count += 1

    async def fetch(self) -> None:
        self.fetch_count += 1
        return None

    async def get_status(self):
        return self.runtime_status

    async def get_qrcode(self):
        return None


def build_settings(qr_path, ttl_seconds=60):
    return SimpleNamespace(
        sgcc_qr_code_file=str(qr_path),
        sgcc_cache_file=str(qr_path.parent / "sgcc_cache.json"),
        sgcc_qr_code_ttl_seconds=ttl_seconds,
        energy_upstream_wait_timeout_seconds=1,
        energy_upstream_poll_interval_seconds=0.01,
    )


class FakeEnergyAccountRepository:
    def __init__(self) -> None:
        self.row = None
        self.upserts = []

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


class FakeHaConnectionGateway:
    def __init__(self, states=None) -> None:
        self.states = states

    async def fetch_states(self, *_args, **_kwargs):
        return self.states


def state(entity_id: str):
    return HaStateEntry(payload={"entity_id": entity_id, "state": "1"})


@pytest.mark.asyncio
async def test_get_status_reports_ready_png(tmp_path):
    qr_path = tmp_path / "login_qr_code.png"
    qr_path.write_bytes(PNG_SIGNATURE + b"test-payload")
    service = SgccLoginQrCodeService(
        build_settings(qr_path),
        runtime_control=FakeRestarter(),
    )

    status = await service.get_status()

    assert status.available is True
    assert status.status == "READY"
    assert status.phase == "QR_READY"
    assert status.qr_code_status == "READY"
    assert status.image_url is not None
    assert status.file_size_bytes == len(PNG_SIGNATURE + b"test-payload")
    assert status.mime_type == "image/png"
    assert status.expires_at is not None
    assert status.age_seconds is not None


@pytest.mark.asyncio
async def test_get_status_reports_pending_for_non_png(tmp_path):
    qr_path = tmp_path / "login_qr_code.png"
    qr_path.write_text("__NO_QR__", encoding="utf-8")
    service = SgccLoginQrCodeService(
        build_settings(qr_path),
        runtime_control=FakeRestarter(),
    )

    status = await service.get_status()

    assert status.available is False
    assert status.status == "PENDING"
    assert status.image_url is None


@pytest.mark.asyncio
async def test_get_status_hides_expired_png(tmp_path):
    qr_path = tmp_path / "login_qr_code.png"
    qr_path.write_bytes(PNG_SIGNATURE + b"test-payload")
    service = SgccLoginQrCodeService(
        build_settings(qr_path, ttl_seconds=-1),
        runtime_control=FakeRestarter(),
    )

    status = await service.get_status()

    assert status.available is False
    assert status.status == "EXPIRED"
    assert status.phase == "QR_EXPIRED"
    assert status.image_url is None


@pytest.mark.asyncio
async def test_get_status_reports_fetching_data_when_runtime_job_running_after_qr_expired(tmp_path):
    restarter = FakeRestarter()
    restarter.runtime_status = SgccRuntimeStatus(
        state="RUNNING",
        qrcode=SgccRuntimeQrCodeStatus(
            available=False,
            status="EXPIRED",
            image_url=None,
            updated_at="2026-04-24T15:43:44+00:00",
            expires_at="2026-04-24T15:44:44+00:00",
            age_seconds=120,
            file_size_bytes=9190,
            mime_type="image/png",
            message="The current SGCC QR code has expired.",
        ),
        accounts=[
            SgccRuntimeAccount(
                account_id="1503525238170",
                timestamp="2026-04-24T15:44:20+00:00",
            )
        ],
        job={
            "state": "RUNNING",
            "kind": "LOGIN",
            "phase": "FETCHING_DATA",
        },
        job_state="RUNNING",
        job_kind="LOGIN",
        job_phase="FETCHING_DATA",
        last_error=None,
        message="SGCC task is running.",
    )
    service = SgccLoginQrCodeService(
        build_settings(tmp_path / "login_qr_code.png"),
        runtime_control=restarter,
    )

    status = await service.get_status()

    assert status.status == "FETCHING_DATA"
    assert status.phase == "FETCHING_DATA"
    assert status.qr_code_status == "EXPIRED"
    assert status.job_state == "RUNNING"
    assert status.job_phase == "FETCHING_DATA"
    assert status.account_count == 1
    assert "Fetching account" in status.message


@pytest.mark.asyncio
async def test_get_status_reports_data_ready_from_runtime_accounts_even_when_qr_expired(tmp_path):
    restarter = FakeRestarter()
    restarter.runtime_status = SgccRuntimeStatus(
        state="IDLE",
        qrcode=SgccRuntimeQrCodeStatus(
            available=False,
            status="EXPIRED",
            image_url=None,
            updated_at="2026-04-24T15:43:44+00:00",
            expires_at="2026-04-24T15:44:44+00:00",
            age_seconds=120,
            file_size_bytes=9190,
            mime_type="image/png",
            message="The current SGCC QR code has expired.",
        ),
        accounts=[
            SgccRuntimeAccount(
                account_id="1503525238170",
                timestamp="2026-04-24T15:44:20+00:00",
            )
        ],
        job={
            "state": "COMPLETED",
            "kind": "LOGIN",
            "phase": "DATA_READY",
        },
        job_state="COMPLETED",
        job_kind="LOGIN",
        job_phase="DATA_READY",
        last_error=None,
        message="SGCC sidecar is idle.",
    )
    service = SgccLoginQrCodeService(
        build_settings(tmp_path / "login_qr_code.png"),
        runtime_control=restarter,
    )

    status = await service.get_status()

    assert status.status == "DATA_READY"
    assert status.phase == "DATA_READY"
    assert status.qr_code_status == "EXPIRED"
    assert status.account_count == 1
    assert status.latest_account_timestamp == "2026-04-24T15:44:20+00:00"


@pytest.mark.asyncio
async def test_get_file_raises_when_qr_not_ready(tmp_path):
    service = SgccLoginQrCodeService(
        build_settings(tmp_path / "missing.png"),
        runtime_control=FakeRestarter(),
    )

    with pytest.raises(AppError):
        await service.get_file()


@pytest.mark.asyncio
async def test_regenerate_removes_old_qr_and_restarts_container(tmp_path):
    qr_path = tmp_path / "login_qr_code.png"
    qr_path.write_bytes(PNG_SIGNATURE + b"test-payload")
    restarter = FakeRestarter()
    service = SgccLoginQrCodeService(
        build_settings(qr_path),
        runtime_control=restarter,
    )

    status = await service.regenerate()

    assert status.status == "PENDING"
    assert qr_path.exists() is False
    assert restarter.restart_count == 1


@pytest.mark.asyncio
async def test_get_status_does_not_auto_bind_energy_from_sgcc_cache(tmp_path):
    qr_path = tmp_path / "login_qr_code.png"
    cache_path = tmp_path / "sgcc_cache.json"
    cache_path.write_text(
        json.dumps({"1503525238170": {"timestamp": "2026-04-20T21:35:02"}}),
        encoding="utf-8",
    )
    repository = FakeEnergyAccountRepository()
    service = SgccLoginQrCodeService(
        build_settings(qr_path),
        energy_account_repository=repository,
        ha_connection_gateway=FakeHaConnectionGateway(
            [
                state("sensor.last_electricity_usage_8170"),
                state("sensor.month_electricity_usage_8170"),
                state("sensor.electricity_charge_balance_8170"),
                state("sensor.yearly_electricity_usage_8170"),
            ]
        ),
        runtime_control=FakeRestarter(),
    )

    status = await service.get_status(
        home_id="home-1",
        terminal_id="terminal-1",
        member_id="member-1",
    )

    assert status.status == "PENDING"
    assert repository.upserts == []


@pytest.mark.asyncio
async def test_bind_energy_account_from_sgcc_cache_and_ha_states(tmp_path):
    qr_path = tmp_path / "login_qr_code.png"
    cache_path = tmp_path / "sgcc_cache.json"
    cache_path.write_text(
        json.dumps({"1503525238170": {"timestamp": "2026-04-20T21:35:02"}}),
        encoding="utf-8",
    )
    repository = FakeEnergyAccountRepository()
    service = SgccLoginQrCodeService(
        build_settings(qr_path),
        energy_account_repository=repository,
        ha_connection_gateway=FakeHaConnectionGateway(
            [
                state("sensor.last_electricity_usage_8170"),
                state("sensor.month_electricity_usage_8170"),
                state("sensor.electricity_charge_balance_8170"),
                state("sensor.yearly_electricity_usage_8170"),
            ]
        ),
        runtime_control=FakeRestarter(),
    )

    status = await service.bind_energy_account(
        home_id="home-1",
        terminal_id="terminal-1",
        member_id="member-1",
    )

    assert status.status == "BOUND"
    assert status.available is False
    assert len(repository.upserts) == 1
    payload = json.loads(repository.upserts[0].account_payload_encrypted)
    assert payload["account_id"] == "1503525238170"
    assert payload["entity_map"]["yesterday_usage"] == "sensor.last_electricity_usage_8170"
    assert payload["entity_map"]["monthly_usage"] == "sensor.month_electricity_usage_8170"
    assert payload["entity_map"]["balance"] == "sensor.electricity_charge_balance_8170"
    assert payload["entity_map"]["yearly_usage"] == "sensor.yearly_electricity_usage_8170"


@pytest.mark.asyncio
async def test_bind_energy_account_uses_sgcc_last_four_suffix_when_ha_states_are_not_ready(tmp_path):
    qr_path = tmp_path / "login_qr_code.png"
    (tmp_path / "sgcc_cache.json").write_text(
        json.dumps({"1503525238170": {"timestamp": "2026-04-20T21:35:02"}}),
        encoding="utf-8",
    )
    repository = FakeEnergyAccountRepository()
    service = SgccLoginQrCodeService(
        build_settings(qr_path),
        energy_account_repository=repository,
        ha_connection_gateway=FakeHaConnectionGateway(None),
        runtime_control=FakeRestarter(),
    )

    status = await service.bind_energy_account(home_id="home-1")

    assert status.status == "BOUND"
    payload = json.loads(repository.upserts[0].account_payload_encrypted)
    assert payload["entity_map"]["balance"] == "sensor.electricity_charge_balance_8170"


@pytest.mark.asyncio
async def test_pull_energy_data_fetches_then_auto_binds_account(tmp_path):
    qr_path = tmp_path / "login_qr_code.png"
    repository = FakeEnergyAccountRepository()
    restarter = FakeRestarter()
    restarter.runtime_status = SgccRuntimeStatus(
        state="IDLE",
        qrcode=None,
        accounts=[
            SgccRuntimeAccount(
                account_id="1503525238170",
                timestamp="2026-04-20T21:35:02",
            )
        ],
        job={"state": "COMPLETED", "kind": "FETCH", "phase": "DATA_READY"},
        job_state="COMPLETED",
        job_kind="FETCH",
        job_phase="DATA_READY",
        last_error=None,
        message="idle",
    )
    service = SgccLoginQrCodeService(
        build_settings(qr_path),
        energy_account_repository=repository,
        ha_connection_gateway=FakeHaConnectionGateway(None),
        runtime_control=restarter,
    )

    status = await service.pull_energy_data(home_id="home-1", terminal_id="terminal-1")

    assert restarter.fetch_count == 1
    assert status.status == "BOUND"
    assert len(repository.upserts) == 1
    payload = json.loads(repository.upserts[0].account_payload_encrypted)
    assert payload["account_id"] == "1503525238170"


@pytest.mark.asyncio
async def test_pull_energy_data_reports_login_required(tmp_path):
    restarter = FakeRestarter()
    restarter.runtime_status = SgccRuntimeStatus(
        state="IDLE",
        qrcode=None,
        accounts=[],
        job={"state": "FAILED", "kind": "FETCH", "phase": "FAILED", "last_error": "LOGIN_REQUIRED"},
        job_state="FAILED",
        job_kind="FETCH",
        job_phase="FAILED",
        last_error="LOGIN_REQUIRED",
        message="idle",
    )
    service = SgccLoginQrCodeService(
        build_settings(tmp_path / "login_qr_code.png"),
        runtime_control=restarter,
    )

    with pytest.raises(AppError) as exc_info:
        await service.pull_energy_data(home_id="home-1")

    assert exc_info.value.details == {"reason": "LOGIN_REQUIRED"}
