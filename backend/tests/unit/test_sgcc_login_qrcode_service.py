from __future__ import annotations

import json
import asyncio

from src.infrastructure.ha.HaConnectionGateway import HaStateEntry
from src.modules.settings.services.query.SgccLoginQrCodeService import (
    SgccLoginQrCodeService,
)
from src.modules.settings.services.query.SgccRuntimeControlService import (
    SgccRuntimeAccount,
    SgccRuntimeQrCodeStatus,
    SgccRuntimeStatus,
)
from src.repositories.base.energy.EnergyAccountRepository import (
    EnergyAccountRow,
)
from src.shared.config.Settings import Settings


class _RuntimeControl:
    async def restart(self):
        return None

    async def fetch(self):
        return None

    async def get_status(self):
        return SgccRuntimeStatus(
            state="IDLE",
            qrcode=SgccRuntimeQrCodeStatus(
                available=False,
                status="PENDING",
                image_url=None,
                updated_at=None,
                expires_at=None,
                age_seconds=None,
                file_size_bytes=None,
                mime_type=None,
                message="pending",
            ),
            accounts=[
                SgccRuntimeAccount(
                    account_id="1503525238170",
                    timestamp="2026-04-20T08:00:00+00:00",
                )
            ],
            job=None,
            message="idle",
        )

    async def get_qrcode(self):
        return None


class _EnergyAccountRepository:
    def __init__(self):
        self.row: EnergyAccountRow | None = None
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


class _HaGateway:
    async def fetch_states(self, *_args, **_kwargs):
        return [
            _state("sensor.last_electricity_usage_8170"),
            _state("sensor.month_electricity_usage_8170"),
            _state("sensor.electricity_charge_balance_8170"),
            _state("sensor.yearly_electricity_usage_8170"),
        ]


def _state(entity_id: str):
    return HaStateEntry(payload={"entity_id": entity_id, "state": "1"})


def test_sgcc_login_bind_energy_account_from_sidecar_accounts(tmp_path):
    repository = _EnergyAccountRepository()
    service = SgccLoginQrCodeService(
        Settings(
            sgcc_qr_code_file=str(tmp_path / "login_qr_code.png"),
            sgcc_cache_file=str(tmp_path / "sgcc_cache.json"),
        ),
        energy_account_repository=repository,
        ha_connection_gateway=_HaGateway(),
        runtime_control=_RuntimeControl(),
    )

    status = asyncio.run(
        service.bind_energy_account(
            home_id="home-1",
            terminal_id="terminal-1",
            member_id="member-1",
        )
    )

    assert status.status == "BOUND"
    assert repository.upserts
    payload = json.loads(repository.upserts[0].account_payload_encrypted)
    assert payload["account_id"] == "1503525238170"
    assert payload["entity_map"] == {
        "yesterday_usage": "sensor.last_electricity_usage_8170",
        "monthly_usage": "sensor.month_electricity_usage_8170",
        "balance": "sensor.electricity_charge_balance_8170",
        "yearly_usage": "sensor.yearly_electricity_usage_8170",
    }
