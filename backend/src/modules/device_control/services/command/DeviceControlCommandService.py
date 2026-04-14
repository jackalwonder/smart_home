from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from src.infrastructure.ha.HaControlGateway import HaControlCommand, HaControlGateway
from src.repositories.base.control.DeviceControlRequestRepository import (
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
    acceptance_status: str
    execution_status: str


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

    async def accept(self, input: DeviceControlCommandInput) -> DeviceControlAcceptedView:
        existing = await self._device_control_request_repository.find_by_request_id(
            input.home_id,
            input.request_id,
        )
        if existing is not None:
            same_semantics = (
                existing.device_id == input.device_id
                and existing.action_type == input.action_type
                and _stable_json(existing.payload_json) == _stable_json(input.payload)
            )
            if not same_semantics:
                raise AppError(
                    ErrorCode.REQUEST_ID_CONFLICT,
                    "request_id already exists with different semantics",
                )
            return DeviceControlAcceptedView(
                request_id=existing.request_id,
                device_id=existing.device_id,
                acceptance_status="ACCEPTED",
                execution_status="PENDING",
            )

        device = await self._device_repository.find_by_id(input.home_id, input.device_id)
        if device is None:
            raise AppError(ErrorCode.DEVICE_NOT_FOUND, "device not found")
        if device.is_readonly_device:
            raise AppError(ErrorCode.DEVICE_READONLY, "device is readonly")

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
        schema_matched = any(schema.action_type == input.action_type for schema in control_schemas)
        if not schema_matched:
            raise AppError(
                ErrorCode.INVALID_CONTROL_PAYLOAD,
                "action_type is not supported by this device",
            )

        now_iso = self._clock.now().isoformat()

        async def _transaction(tx: Any) -> None:
            inserted = await self._device_control_request_repository.insert(
                NewDeviceControlRequestRow(
                    home_id=input.home_id,
                    request_id=input.request_id,
                    device_id=input.device_id,
                    action_type=input.action_type,
                    payload_json=input.payload,
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
                    },
                    occurred_at=now_iso,
                ),
                ctx=RepoContext(tx=tx),
            )

        await self._unit_of_work.run_in_transaction(_transaction)

        await self._ha_control_gateway.submit_control(
            HaControlCommand(
                home_id=input.home_id,
                device_id=input.device_id,
                request_id=input.request_id,
                action_type=input.action_type,
                payload=input.payload,
            )
        )

        return DeviceControlAcceptedView(
            request_id=input.request_id,
            device_id=input.device_id,
            acceptance_status="ACCEPTED",
            execution_status="PENDING",
        )
