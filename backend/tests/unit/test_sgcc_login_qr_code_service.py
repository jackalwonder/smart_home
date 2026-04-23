from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from src.infrastructure.ha.HaConnectionGateway import HaStateEntry
from src.modules.settings.services.query.SgccLoginQrCodeService import (
    PNG_SIGNATURE,
    SgccLoginQrCodeService,
)
from src.repositories.base.energy.EnergyAccountRepository import EnergyAccountRow
from src.shared.errors.AppError import AppError


class FakeRestarter:
    def __init__(self) -> None:
        self.restart_count = 0

    async def restart(self) -> None:
        self.restart_count += 1

    async def fetch(self) -> None:
        return None

    async def get_status(self):
        return None

    async def get_qrcode(self):
        return None


def build_settings(qr_path, ttl_seconds=60):
    return SimpleNamespace(
        sgcc_qr_code_file=str(qr_path),
        sgcc_cache_file=str(qr_path.parent / "sgcc_cache.json"),
        sgcc_qr_code_ttl_seconds=ttl_seconds,
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
    assert status.image_url is None


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
