from __future__ import annotations

import json
import math
from dataclasses import dataclass
from typing import Any

from src.infrastructure.ha.HaControlGateway import HaControlCommand, HaControlGateway
from src.repositories.base.control.DeviceControlRequestRepository import (
    DeviceControlResultUpdate,
    DeviceControlRequestRepository,
    NewDeviceControlRequestRow,
)
from src.repositories.base.control.DeviceControlTransitionRepository import (
    DeviceControlTransitionRepository,
    NewDeviceControlTransitionRow,
)
from src.repositories.base.devices.DeviceControlSchemaRepository import (
    DeviceControlSchemaRepository,
)
from src.repositories.base.devices.DeviceRepository import DeviceRepository
from src.repositories.base.devices.DeviceRuntimeStateRepository import (
    DeviceRuntimeStateRepository,
)
from src.repositories.base.realtime.WsEventOutboxRepository import (
    NewWsEventOutboxRow,
    WsEventOutboxRepository,
)
from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode
from src.shared.kernel.Clock import Clock
from src.shared.kernel.EventIdGenerator import EventIdGenerator
from src.shared.kernel.RepoContext import RepoContext
from src.shared.kernel.UnitOfWork import UnitOfWork


@dataclass(frozen=True)
class DeviceControlCommandInput:
    home_id: str
    request_id: str
    device_id: str
    action_type: str
    payload: dict[str, Any]
    client_ts: str | None = None


@dataclass(frozen=True)
class DeviceControlAcceptedView:
    request_id: str
    device_id: str
    accepted: bool
    acceptance_status: str
    confirmation_type: str
    accepted_at: str | None
    timeout_seconds: int
    retry_scheduled: bool
    message: str
    result_query_path: str


@dataclass(frozen=True)
class ValidatedControlPayload:
    payload: dict[str, Any]
    schema_target_scope: str | None
    schema_target_key: str | None


def _stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


class DeviceControlCommandService:
    def __init__(
        self,
        unit_of_work: UnitOfWork,
        device_repository: DeviceRepository,
        device_runtime_state_repository: DeviceRuntimeStateRepository,
        device_control_schema_repository: DeviceControlSchemaRepository,
        device_control_request_repository: DeviceControlRequestRepository,
        device_control_transition_repository: DeviceControlTransitionRepository,
        ws_event_outbox_repository: WsEventOutboxRepository,
        ha_control_gateway: HaControlGateway,
        event_id_generator: EventIdGenerator,
        clock: Clock,
    ) -> None:
        self._unit_of_work = unit_of_work
        self._device_repository = device_repository
        self._device_runtime_state_repository = device_runtime_state_repository
        self._device_control_schema_repository = device_control_schema_repository
        self._device_control_request_repository = device_control_request_repository
        self._device_control_transition_repository = device_control_transition_repository
        self._ws_event_outbox_repository = ws_event_outbox_repository
        self._ha_control_gateway = ha_control_gateway
        self._event_id_generator = event_id_generator
        self._clock = clock

    def _validate_payload_shape(
        self,
        action_type: str,
        payload: dict[str, Any],
        control_schemas: list,
    ) -> ValidatedControlPayload:
        matching_schemas = [schema for schema in control_schemas if schema.action_type == action_type]
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
            if isinstance(value, bool) or not isinstance(value, (int, float)):
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

    async def accept(self, input: DeviceControlCommandInput) -> DeviceControlAcceptedView:
        existing = await self._device_control_request_repository.find_by_request_id(
            input.home_id,
            input.request_id,
        )
        validated_payload = None
        if existing is not None:
            same_semantics = False
            if existing.device_id == input.device_id and existing.action_type == input.action_type:
                control_schemas = await self._device_control_schema_repository.list_by_device_id(
                    input.device_id
                )
                validated_payload = self._validate_payload_shape(
                    input.action_type,
                    input.payload,
                    control_schemas,
                )
                same_semantics = _stable_json(existing.payload_json) == _stable_json(
                    validated_payload.payload
                )
            if not same_semantics:
                raise AppError(
                    ErrorCode.REQUEST_ID_CONFLICT,
                    "request_id already exists with different semantics",
                )
            return DeviceControlAcceptedView(
                request_id=existing.request_id,
                device_id=existing.device_id,
                accepted=True,
                acceptance_status="ACCEPTED",
                confirmation_type=existing.confirmation_type,
                accepted_at=existing.accepted_at,
                timeout_seconds=existing.timeout_seconds,
                retry_scheduled=False,
                message="Control request accepted",
                result_query_path=f"/api/v1/device-controls/{existing.request_id}",
            )

        device = await self._device_repository.find_by_id(input.home_id, input.device_id)
        if device is None:
            raise AppError(ErrorCode.DEVICE_NOT_FOUND, "device not found")
        if device.is_readonly_device:
            raise AppError(ErrorCode.READONLY_DEVICE, "device is readonly")

        runtime_states = await self._device_runtime_state_repository.find_by_device_ids(
            input.home_id,
            [input.device_id],
        )
        runtime_state = runtime_states[0] if runtime_states else None
        if runtime_state is not None and runtime_state.is_offline:
            raise AppError(ErrorCode.DEVICE_OFFLINE, "device is offline")

        control_schemas = await self._device_control_schema_repository.list_by_device_id(
            input.device_id
        )
        if validated_payload is None:
            validated_payload = self._validate_payload_shape(
                input.action_type,
                input.payload,
                control_schemas,
            )

        now_iso = self._clock.now().isoformat()

        async def _transaction(tx: Any):
            inserted = await self._device_control_request_repository.insert(
                NewDeviceControlRequestRow(
                    home_id=input.home_id,
                    request_id=input.request_id,
                    device_id=input.device_id,
                    action_type=input.action_type,
                    payload_json=validated_payload.payload,
                    client_ts=input.client_ts,
                    acceptance_status="ACCEPTED",
                    confirmation_type="ACK_DRIVEN",
                    execution_status="PENDING",
                    timeout_seconds=30,
                ),
                ctx=RepoContext(tx=tx),
            )

            await self._device_control_transition_repository.insert(
                NewDeviceControlTransitionRow(
                    control_request_id=inserted.id,
                    from_status=None,
                    to_status="PENDING",
                    reason="REQUEST_ACCEPTED",
                    error_code=None,
                    payload_json={"request_id": input.request_id},
                ),
                ctx=RepoContext(tx=tx),
            )

            await self._ws_event_outbox_repository.insert(
                NewWsEventOutboxRow(
                    home_id=input.home_id,
                    event_id=self._event_id_generator.next_event_id(),
                    event_type="device_state_changed",
                    change_domain="DEVICE_STATE",
                    snapshot_required=False,
                    payload_json={
                        "related_request_id": input.request_id,
                        "device_id": input.device_id,
                        "confirmation_type": inserted.confirmation_type,
                        "execution_status": inserted.execution_status,
                        "runtime_state": None,
                        "error_code": None,
                        "error_message": None,
                    },
                    occurred_at=now_iso,
                ),
                ctx=RepoContext(tx=tx),
            )

            return inserted

        inserted = await self._unit_of_work.run_in_transaction(_transaction)

        try:
            await self._ha_control_gateway.submit_control(
                HaControlCommand(
                    home_id=input.home_id,
                    device_id=input.device_id,
                    request_id=input.request_id,
                    action_type=input.action_type,
                    payload=validated_payload.payload,
                )
            )
        except Exception as exc:
            completed_at = self._clock.now().isoformat()

            async def _mark_failed(tx: Any):
                await self._device_control_request_repository.update_execution_result(
                    DeviceControlResultUpdate(
                        home_id=input.home_id,
                        request_id=input.request_id,
                        execution_status="FAILED",
                        final_runtime_state_json=None,
                        error_code=ErrorCode.HA_UNAVAILABLE,
                        error_message=str(exc),
                        completed_at=completed_at,
                    ),
                    ctx=RepoContext(tx=tx),
                )
                await self._device_control_transition_repository.insert(
                    NewDeviceControlTransitionRow(
                        control_request_id=inserted.id,
                        from_status="PENDING",
                        to_status="FAILED",
                        reason="HA_SUBMIT_FAILED",
                        error_code=ErrorCode.HA_UNAVAILABLE,
                        payload_json={"request_id": input.request_id},
                    ),
                    ctx=RepoContext(tx=tx),
                )
                await self._ws_event_outbox_repository.insert(
                    NewWsEventOutboxRow(
                        home_id=input.home_id,
                        event_id=self._event_id_generator.next_event_id(),
                        event_type="device_state_changed",
                        change_domain="DEVICE_STATE",
                        snapshot_required=False,
                        payload_json={
                            "related_request_id": input.request_id,
                            "device_id": input.device_id,
                            "confirmation_type": inserted.confirmation_type,
                            "execution_status": "FAILED",
                            "runtime_state": None,
                            "error_code": ErrorCode.HA_UNAVAILABLE,
                            "error_message": str(exc),
                        },
                        occurred_at=completed_at,
                    ),
                    ctx=RepoContext(tx=tx),
                )

            await self._unit_of_work.run_in_transaction(_mark_failed)
            raise AppError(
                ErrorCode.HA_UNAVAILABLE,
                "failed to submit control to Home Assistant",
            ) from exc

        completed_at = self._clock.now().isoformat()

        async def _mark_succeeded(tx: Any):
            await self._device_control_request_repository.update_execution_result(
                DeviceControlResultUpdate(
                    home_id=input.home_id,
                    request_id=input.request_id,
                    execution_status="SUCCESS",
                    final_runtime_state_json=None,
                    error_code=None,
                    error_message=None,
                    completed_at=completed_at,
                ),
                ctx=RepoContext(tx=tx),
            )
            await self._device_control_transition_repository.insert(
                NewDeviceControlTransitionRow(
                    control_request_id=inserted.id,
                    from_status="PENDING",
                    to_status="SUCCESS",
                    reason="HA_ACKNOWLEDGED",
                    error_code=None,
                    payload_json={"request_id": input.request_id},
                ),
                ctx=RepoContext(tx=tx),
            )
            await self._ws_event_outbox_repository.insert(
                NewWsEventOutboxRow(
                    home_id=input.home_id,
                    event_id=self._event_id_generator.next_event_id(),
                    event_type="device_state_changed",
                    change_domain="DEVICE_STATE",
                    snapshot_required=False,
                    payload_json={
                        "related_request_id": input.request_id,
                        "device_id": input.device_id,
                        "confirmation_type": inserted.confirmation_type,
                        "execution_status": "SUCCESS",
                        "runtime_state": None,
                        "error_code": None,
                        "error_message": None,
                    },
                    occurred_at=completed_at,
                ),
                ctx=RepoContext(tx=tx),
            )

        await self._unit_of_work.run_in_transaction(_mark_succeeded)

        return DeviceControlAcceptedView(
            request_id=input.request_id,
            device_id=input.device_id,
            accepted=True,
            acceptance_status="ACCEPTED",
            confirmation_type=inserted.confirmation_type,
            accepted_at=inserted.accepted_at,
            timeout_seconds=inserted.timeout_seconds,
            retry_scheduled=False,
            message="Control request accepted",
            result_query_path=f"/api/v1/device-controls/{input.request_id}",
        )
