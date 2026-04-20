from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from src.modules.device_control.services.command.DeviceControlCommandService import (
    DeviceControlCommandInput,
    DeviceControlCommandService,
)
from src.repositories.rows.index import DeviceControlRequestRow, DeviceRow
from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode


@dataclass
class _Schema:
    action_type: str
    target_scope: str | None
    target_key: str | None
    value_type: str | None
    value_range_json: dict | None
    allowed_values_json: list | None
    unit: str | None


class _UnitOfWork:
    async def run_in_transaction(self, func):
        return await func(SimpleNamespace(session=None))


class _DeviceRepository:
    async def find_by_id(self, _home_id, device_id):
        return DeviceRow(
            id=device_id,
            home_id="home-1",
            room_id="room-1",
            display_name="Lamp",
            raw_name=None,
            device_type="light",
            is_readonly_device=False,
            is_complex_device=False,
            entry_behavior="QUICK_ACTION",
        )


class _RuntimeRepository:
    async def find_by_device_ids(self, _home_id, _device_ids):
        return []


class _SchemaRepository:
    def __init__(self, schemas):
        self._schemas = schemas

    async def list_by_device_id(self, _device_id):
        return self._schemas


class _RequestRepository:
    def __init__(self, existing=None):
        self._existing = existing
        self.updated_result = None

    async def find_by_request_id(self, _home_id, _request_id):
        return self._existing

    async def insert(self, input, ctx=None):
        return DeviceControlRequestRow(
            id="row-1",
            home_id=input.home_id,
            request_id=input.request_id,
            device_id=input.device_id,
            action_type=input.action_type,
            payload_json=input.payload_json,
            acceptance_status=input.acceptance_status,
            confirmation_type=input.confirmation_type,
            execution_status=input.execution_status,
            timeout_seconds=input.timeout_seconds,
            final_runtime_state_json=None,
            error_code=None,
            error_message=None,
            accepted_at="2026-04-14T10:00:00+00:00",
            completed_at=None,
        )

    async def update_execution_result(self, input, ctx=None):
        self.updated_result = input
        return None


class _TransitionRepository:
    async def insert(self, *_args, **_kwargs):
        return None


class _WsEventOutboxRepository:
    async def insert(self, *_args, **_kwargs):
        return None


class _Gateway:
    def __init__(self):
        self.submitted_payload = None

    async def submit_control(self, command):
        self.submitted_payload = command.payload


class _EventIdGenerator:
    def next_event_id(self):
        return "evt-1"


class _Clock:
    def now(self):
        return datetime(2026, 4, 14, 10, 0, 0, tzinfo=timezone.utc)


def _build_service(*, schemas, existing=None):
    gateway = _Gateway()
    service = DeviceControlCommandService(
        unit_of_work=_UnitOfWork(),
        device_repository=_DeviceRepository(),
        device_runtime_state_repository=_RuntimeRepository(),
        device_control_schema_repository=_SchemaRepository(schemas),
        device_control_request_repository=_RequestRepository(existing=existing),
        device_control_transition_repository=_TransitionRepository(),
        ws_event_outbox_repository=_WsEventOutboxRepository(),
        ha_control_gateway=gateway,
        event_id_generator=_EventIdGenerator(),
        clock=_Clock(),
    )
    return service, gateway


@pytest.mark.asyncio
async def test_accept_rejects_unsupported_action():
    service, _ = _build_service(
        schemas=[
            _Schema(
                action_type="SET_POWER_STATE",
                target_scope="PRIMARY",
                target_key="entity.light_1",
                value_type="BOOLEAN",
                value_range_json=None,
                allowed_values_json=None,
                unit=None,
            )
        ]
    )

    with pytest.raises(AppError) as exc_info:
        await service.accept(
            DeviceControlCommandInput(
                home_id="home-1",
                request_id="req-1",
                device_id="device-1",
                action_type="SET_MODE",
                payload={"value": "eco"},
            )
        )

    assert exc_info.value.code == ErrorCode.UNSUPPORTED_ACTION


@pytest.mark.asyncio
async def test_accept_rejects_unsupported_target():
    service, _ = _build_service(
        schemas=[
            _Schema(
                action_type="SET_POWER_STATE",
                target_scope="PRIMARY",
                target_key="entity.light_1",
                value_type="BOOLEAN",
                value_range_json=None,
                allowed_values_json=None,
                unit=None,
            )
        ]
    )

    with pytest.raises(AppError) as exc_info:
        await service.accept(
            DeviceControlCommandInput(
                home_id="home-1",
                request_id="req-1",
                device_id="device-1",
                action_type="SET_POWER_STATE",
                payload={
                    "target_scope": "PRIMARY",
                    "target_key": "entity.other",
                    "value": True,
                },
            )
        )

    assert exc_info.value.code == ErrorCode.UNSUPPORTED_TARGET


@pytest.mark.asyncio
async def test_accept_rejects_number_out_of_range():
    service, _ = _build_service(
        schemas=[
            _Schema(
                action_type="SET_VALUE",
                target_scope="PRIMARY",
                target_key="entity.number_1",
                value_type="NUMBER",
                value_range_json={"min": 0, "max": 100, "step": 1},
                allowed_values_json=None,
                unit="%",
            )
        ]
    )

    with pytest.raises(AppError) as exc_info:
        await service.accept(
            DeviceControlCommandInput(
                home_id="home-1",
                request_id="req-1",
                device_id="device-1",
                action_type="SET_VALUE",
                payload={"value": 101, "unit": "%"},
            )
        )

    assert exc_info.value.code == ErrorCode.VALUE_OUT_OF_RANGE


@pytest.mark.asyncio
async def test_accept_rejects_payload_unit_when_schema_has_no_unit():
    service, _ = _build_service(
        schemas=[
            _Schema(
                action_type="SET_POWER_STATE",
                target_scope="PRIMARY",
                target_key="entity.light_1",
                value_type="BOOLEAN",
                value_range_json=None,
                allowed_values_json=None,
                unit=None,
            )
        ]
    )

    with pytest.raises(AppError) as exc_info:
        await service.accept(
            DeviceControlCommandInput(
                home_id="home-1",
                request_id="req-1",
                device_id="device-1",
                action_type="SET_POWER_STATE",
                payload={"value": True, "unit": "%"},
            )
        )

    assert exc_info.value.code == ErrorCode.INVALID_PARAMS


@pytest.mark.asyncio
async def test_accept_rejects_enum_value_outside_allowed_values():
    service, _ = _build_service(
        schemas=[
            _Schema(
                action_type="SET_MODE",
                target_scope="PRIMARY",
                target_key="entity.climate_1",
                value_type="ENUM",
                value_range_json=None,
                allowed_values_json=["cool", "heat"],
                unit=None,
            )
        ]
    )

    with pytest.raises(AppError) as exc_info:
        await service.accept(
            DeviceControlCommandInput(
                home_id="home-1",
                request_id="req-1",
                device_id="device-1",
                action_type="SET_MODE",
                payload={"value": "dry"},
            )
        )

    assert exc_info.value.code == ErrorCode.VALUE_OUT_OF_RANGE


@pytest.mark.asyncio
async def test_accept_reuses_existing_request_with_normalized_payload():
    existing = DeviceControlRequestRow(
        id="row-1",
        home_id="home-1",
        request_id="req-1",
        device_id="device-1",
        action_type="SET_POWER_STATE",
        payload_json={
            "target_scope": "PRIMARY",
            "target_key": "entity.light_1",
            "value": True,
            "unit": None,
        },
        acceptance_status="ACCEPTED",
        confirmation_type="ACK_DRIVEN",
        execution_status="PENDING",
        timeout_seconds=30,
        final_runtime_state_json=None,
        error_code=None,
        error_message=None,
        accepted_at="2026-04-14T10:00:00+00:00",
        completed_at=None,
    )
    service, gateway = _build_service(
        schemas=[
            _Schema(
                action_type="SET_POWER_STATE",
                target_scope="PRIMARY",
                target_key="entity.light_1",
                value_type="BOOLEAN",
                value_range_json=None,
                allowed_values_json=None,
                unit=None,
            )
        ],
        existing=existing,
    )

    result = await service.accept(
        DeviceControlCommandInput(
            home_id="home-1",
            request_id="req-1",
            device_id="device-1",
            action_type="SET_POWER_STATE",
            payload={"value": True},
        )
    )

    assert result.request_id == "req-1"
    assert result.confirmation_type == "ACK_DRIVEN"
    assert result.timeout_seconds == 30
    assert gateway.submitted_payload is None
