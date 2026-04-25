from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode


@dataclass(frozen=True)
class ValidatedControlPayload:
    payload: dict[str, Any]
    schema_target_scope: str | None
    schema_target_key: str | None


class DeviceControlPayloadValidator:
    def validate(
        self,
        action_type: str,
        payload: dict[str, Any],
        control_schemas: list,
    ) -> ValidatedControlPayload:
        matching_schemas = [
            schema for schema in control_schemas if schema.action_type == action_type
        ]
        if not matching_schemas:
            raise AppError(
                ErrorCode.UNSUPPORTED_ACTION,
                "action_type is not supported by this device",
                details={"action_type": action_type},
            )

        requested_target_scope = payload.get("target_scope")
        requested_target_key = payload.get("target_key")
        matched_schema = None

        if requested_target_scope is not None or requested_target_key is not None:
            for schema in matching_schemas:
                if (
                    schema.target_scope == requested_target_scope
                    and schema.target_key == requested_target_key
                ):
                    matched_schema = schema
                    break
            if matched_schema is None:
                raise AppError(
                    ErrorCode.UNSUPPORTED_TARGET,
                    "control target is not supported by this device",
                    details={
                        "action_type": action_type,
                        "target_scope": requested_target_scope,
                        "target_key": requested_target_key,
                    },
                )
        elif len(matching_schemas) == 1:
            matched_schema = matching_schemas[0]
        else:
            raise AppError(
                ErrorCode.UNSUPPORTED_TARGET,
                "target_scope and target_key are required for this action",
                details={"action_type": action_type},
            )

        value = payload.get("value")
        unit = payload.get("unit")
        if unit is not None and matched_schema.unit is None:
            raise AppError(
                ErrorCode.INVALID_PARAMS,
                "payload unit is not supported by this action",
                details={"fields": [{"field": "payload.unit", "reason": "unsupported"}]},
            )
        if unit is not None and matched_schema.unit is not None and unit != matched_schema.unit:
            raise AppError(
                ErrorCode.VALUE_OUT_OF_RANGE,
                "payload unit does not match schema unit",
                details={
                    "expected_unit": matched_schema.unit,
                    "actual_unit": unit,
                },
            )

        value_type = matched_schema.value_type or "NONE"
        if value_type == "NONE":
            if value is not None:
                raise AppError(
                    ErrorCode.INVALID_PARAMS,
                    "payload value must be null for this action",
                    details={"fields": [{"field": "payload.value", "reason": "must_be_null"}]},
                )
        elif value_type == "BOOLEAN":
            if not isinstance(value, bool):
                raise AppError(
                    ErrorCode.INVALID_PARAMS,
                    "payload value must be boolean",
                    details={"fields": [{"field": "payload.value", "reason": "invalid_type"}]},
                )
        elif value_type == "ENUM":
            allowed_values = matched_schema.allowed_values_json or []
            if value not in allowed_values:
                raise AppError(
                    ErrorCode.VALUE_OUT_OF_RANGE,
                    "payload value is outside allowed values",
                    details={
                        "allowed_values": allowed_values,
                        "actual_value": value,
                    },
                )
        elif value_type == "NUMBER":
            if isinstance(value, bool) or not isinstance(value, int | float):
                raise AppError(
                    ErrorCode.INVALID_PARAMS,
                    "payload value must be numeric",
                    details={"fields": [{"field": "payload.value", "reason": "invalid_type"}]},
                )
            number_value = float(value)
            value_range = matched_schema.value_range_json or {}
            minimum = value_range.get("min")
            maximum = value_range.get("max")
            step = value_range.get("step")
            if minimum is not None and number_value < float(minimum):
                raise AppError(
                    ErrorCode.VALUE_OUT_OF_RANGE,
                    "payload value is below minimum range",
                    details={"min": minimum, "actual_value": number_value},
                )
            if maximum is not None and number_value > float(maximum):
                raise AppError(
                    ErrorCode.VALUE_OUT_OF_RANGE,
                    "payload value exceeds maximum range",
                    details={"max": maximum, "actual_value": number_value},
                )
            if step not in (None, 0) and minimum is not None:
                distance = (number_value - float(minimum)) / float(step)
                if not math.isclose(distance, round(distance), abs_tol=1e-6):
                    raise AppError(
                        ErrorCode.VALUE_OUT_OF_RANGE,
                        "payload value does not match schema step",
                        details={"step": step, "actual_value": number_value},
                    )
        else:
            raise AppError(
                ErrorCode.INVALID_PARAMS,
                "schema value_type is unsupported",
                details={"value_type": value_type},
            )

        return ValidatedControlPayload(
            payload={
                "target_scope": requested_target_scope
                if requested_target_scope is not None
                else matched_schema.target_scope,
                "target_key": requested_target_key
                if requested_target_key is not None
                else matched_schema.target_key,
                "value": value,
                "unit": unit if unit is not None else matched_schema.unit,
            },
            schema_target_scope=matched_schema.target_scope,
            schema_target_key=matched_schema.target_key,
        )
