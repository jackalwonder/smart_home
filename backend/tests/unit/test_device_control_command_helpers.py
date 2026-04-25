from __future__ import annotations

from dataclasses import dataclass

import pytest

from src.modules.device_control.services.command.DeviceControlIdempotency import (
    has_same_request_semantics,
)
from src.modules.device_control.services.command.DeviceControlPayloadValidator import (
    DeviceControlPayloadValidator,
)
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


@dataclass
class _ExistingRequest:
    device_id: str
    action_type: str
    payload_json: dict


def test_payload_validator_normalizes_single_boolean_schema_target():
    validated = DeviceControlPayloadValidator().validate(
        "SET_POWER_STATE",
        {"value": True},
        [
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
    )

    assert validated.payload == {
        "target_scope": "PRIMARY",
        "target_key": "entity.light_1",
        "value": True,
        "unit": None,
    }


def test_payload_validator_rejects_number_that_misses_step():
    with pytest.raises(AppError) as exc_info:
        DeviceControlPayloadValidator().validate(
            "SET_VALUE",
            {"value": 2.5, "unit": "%"},
            [
                _Schema(
                    action_type="SET_VALUE",
                    target_scope="PRIMARY",
                    target_key="entity.number_1",
                    value_type="NUMBER",
                    value_range_json={"min": 0, "max": 10, "step": 2},
                    allowed_values_json=None,
                    unit="%",
                )
            ],
        )

    assert exc_info.value.code == ErrorCode.VALUE_OUT_OF_RANGE


def test_idempotency_uses_stable_payload_semantics():
    existing = _ExistingRequest(
        device_id="device-1",
        action_type="SET_MODE",
        payload_json={"unit": None, "value": "cool", "target_scope": "PRIMARY"},
    )

    assert has_same_request_semantics(
        existing=existing,
        device_id="device-1",
        action_type="SET_MODE",
        payload={"target_scope": "PRIMARY", "value": "cool", "unit": None},
    )
    assert not has_same_request_semantics(
        existing=existing,
        device_id="device-2",
        action_type="SET_MODE",
        payload={"target_scope": "PRIMARY", "value": "cool", "unit": None},
    )
