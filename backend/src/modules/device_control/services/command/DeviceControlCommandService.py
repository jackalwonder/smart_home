from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from src.infrastructure.ha.HaControlGateway import HaControlCommand, HaControlGateway
from src.modules.device_control.services.command.DeviceControlIdempotency import (
    has_same_request_semantics,
)
from src.modules.device_control.services.command.DeviceControlLifecycleWriter import (
    DeviceControlLifecycleWriter,
)
from src.modules.device_control.services.command.DeviceControlPayloadValidator import (
    DeviceControlPayloadValidator,
    ValidatedControlPayload,
)
from src.repositories.base.control.DeviceControlRequestRepository import DeviceControlRequestRepository
from src.repositories.base.control.DeviceControlTransitionRepository import (
    DeviceControlTransitionRepository,
)
from src.repositories.base.devices.DeviceControlSchemaRepository import (
    DeviceControlSchemaRepository,
)
from src.repositories.base.devices.DeviceRepository import DeviceRepository
from src.repositories.base.devices.DeviceRuntimeStateRepository import (
    DeviceRuntimeStateRepository,
)
from src.repositories.base.realtime.WsEventOutboxRepository import (
    WsEventOutboxRepository,
)
from src.shared.errors.AppError import AppError
from src.shared.errors.ErrorCode import ErrorCode
from src.shared.kernel.Clock import Clock
from src.shared.kernel.EventIdGenerator import EventIdGenerator
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
        payload_validator: DeviceControlPayloadValidator | None = None,
        lifecycle_writer: DeviceControlLifecycleWriter | None = None,
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
        self._payload_validator = payload_validator or DeviceControlPayloadValidator()
        self._lifecycle_writer = lifecycle_writer or DeviceControlLifecycleWriter(
            device_control_request_repository=device_control_request_repository,
            device_control_transition_repository=device_control_transition_repository,
            ws_event_outbox_repository=ws_event_outbox_repository,
            event_id_generator=event_id_generator,
        )

    def _validate_payload_shape(
        self,
        action_type: str,
        payload: dict[str, Any],
        control_schemas: list,
    ) -> ValidatedControlPayload:
        return self._payload_validator.validate(action_type, payload, control_schemas)

    async def accept(self, input: DeviceControlCommandInput) -> DeviceControlAcceptedView:
        existing = await self._device_control_request_repository.find_by_request_id(
            input.home_id,
            input.request_id,
        )
        validated_payload = None
        if existing is not None:
            if existing.device_id == input.device_id and existing.action_type == input.action_type:
                control_schemas = await self._device_control_schema_repository.list_by_device_id(
                    input.device_id
                )
                validated_payload = self._validate_payload_shape(
                    input.action_type,
                    input.payload,
                    control_schemas,
                )
                same_semantics = has_same_request_semantics(
                    existing=existing,
                    device_id=input.device_id,
                    action_type=input.action_type,
                    payload=validated_payload.payload,
                )
            else:
                same_semantics = False
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
            return await self._lifecycle_writer.insert_accepted(
                tx=tx,
                home_id=input.home_id,
                request_id=input.request_id,
                device_id=input.device_id,
                action_type=input.action_type,
                payload_json=validated_payload.payload,
                client_ts=input.client_ts,
                occurred_at=now_iso,
            )

        inserted = await self._unit_of_work.run_in_transaction(_transaction)

        async def _mark_failed(
            *,
            completed_at: str,
            reason: str,
            error_code: str,
            error_message: str,
        ) -> None:
            async def _transaction_failed(tx: Any):
                await self._lifecycle_writer.mark_failed(
                    tx=tx,
                    control_request_id=inserted.id,
                    home_id=input.home_id,
                    request_id=input.request_id,
                    device_id=input.device_id,
                    confirmation_type=inserted.confirmation_type,
                    completed_at=completed_at,
                    reason=reason,
                    error_code=error_code,
                    error_message=error_message,
                )

            await self._unit_of_work.run_in_transaction(_transaction_failed)

        try:
            submit_result = await self._ha_control_gateway.submit_control(
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
            await _mark_failed(
                completed_at=completed_at,
                reason="HA_SUBMIT_FAILED",
                error_code=str(ErrorCode.HA_UNAVAILABLE),
                error_message=str(exc),
            )
            raise AppError(
                ErrorCode.HA_UNAVAILABLE,
                "failed to submit control to Home Assistant",
            ) from exc

        if not submit_result.submitted:
            completed_at = self._clock.now().isoformat()
            error_message = submit_result.message or "Home Assistant control request was not submitted."
            await _mark_failed(
                completed_at=completed_at,
                reason=submit_result.reason,
                error_code=str(ErrorCode.HA_UNAVAILABLE),
                error_message=error_message,
            )
            raise AppError(
                ErrorCode.HA_UNAVAILABLE,
                "failed to submit control to Home Assistant",
                details={
                    "ha_status": submit_result.status,
                    "ha_reason": submit_result.reason,
                },
            )

        completed_at = self._clock.now().isoformat()

        async def _mark_succeeded(tx: Any):
            await self._lifecycle_writer.mark_succeeded(
                tx=tx,
                control_request_id=inserted.id,
                home_id=input.home_id,
                request_id=input.request_id,
                device_id=input.device_id,
                confirmation_type=inserted.confirmation_type,
                completed_at=completed_at,
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
