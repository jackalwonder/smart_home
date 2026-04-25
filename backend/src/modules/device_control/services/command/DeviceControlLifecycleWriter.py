from __future__ import annotations

from typing import Any

from src.repositories.base.control.DeviceControlRequestRepository import (
    DeviceControlResultUpdate,
    DeviceControlRequestRepository,
    NewDeviceControlRequestRow,
)
from src.repositories.base.control.DeviceControlTransitionRepository import (
    DeviceControlTransitionRepository,
    NewDeviceControlTransitionRow,
)
from src.repositories.base.realtime.WsEventOutboxRepository import (
    NewWsEventOutboxRow,
    WsEventOutboxRepository,
)
from src.shared.kernel.EventIdGenerator import EventIdGenerator
from src.shared.kernel.RepoContext import RepoContext


class DeviceControlLifecycleWriter:
    def __init__(
        self,
        *,
        device_control_request_repository: DeviceControlRequestRepository,
        device_control_transition_repository: DeviceControlTransitionRepository,
        ws_event_outbox_repository: WsEventOutboxRepository,
        event_id_generator: EventIdGenerator,
    ) -> None:
        self._device_control_request_repository = device_control_request_repository
        self._device_control_transition_repository = device_control_transition_repository
        self._ws_event_outbox_repository = ws_event_outbox_repository
        self._event_id_generator = event_id_generator

    async def insert_accepted(
        self,
        *,
        tx: Any,
        home_id: str,
        request_id: str,
        device_id: str,
        action_type: str,
        payload_json: dict[str, Any],
        client_ts: str | None,
        occurred_at: str,
    ):
        ctx = RepoContext(tx=tx)
        inserted = await self._device_control_request_repository.insert(
            NewDeviceControlRequestRow(
                home_id=home_id,
                request_id=request_id,
                device_id=device_id,
                action_type=action_type,
                payload_json=payload_json,
                client_ts=client_ts,
                acceptance_status="ACCEPTED",
                confirmation_type="ACK_DRIVEN",
                execution_status="PENDING",
                timeout_seconds=30,
            ),
            ctx=ctx,
        )

        await self._device_control_transition_repository.insert(
            NewDeviceControlTransitionRow(
                control_request_id=inserted.id,
                from_status=None,
                to_status="PENDING",
                reason="REQUEST_ACCEPTED",
                error_code=None,
                payload_json={"request_id": request_id},
            ),
            ctx=ctx,
        )
        await self._insert_state_event(
            ctx=ctx,
            home_id=home_id,
            request_id=request_id,
            device_id=device_id,
            confirmation_type=inserted.confirmation_type,
            execution_status=inserted.execution_status,
            error_code=None,
            error_message=None,
            occurred_at=occurred_at,
        )
        return inserted

    async def mark_failed(
        self,
        *,
        tx: Any,
        control_request_id: str,
        home_id: str,
        request_id: str,
        device_id: str,
        confirmation_type: str,
        completed_at: str,
        reason: str,
        error_code: str,
        error_message: str,
    ) -> None:
        ctx = RepoContext(tx=tx)
        await self._device_control_request_repository.update_execution_result(
            DeviceControlResultUpdate(
                home_id=home_id,
                request_id=request_id,
                execution_status="FAILED",
                final_runtime_state_json=None,
                error_code=error_code,
                error_message=error_message,
                completed_at=completed_at,
            ),
            ctx=ctx,
        )
        await self._device_control_transition_repository.insert(
            NewDeviceControlTransitionRow(
                control_request_id=control_request_id,
                from_status="PENDING",
                to_status="FAILED",
                reason=reason,
                error_code=error_code,
                payload_json={"request_id": request_id},
            ),
            ctx=ctx,
        )
        await self._insert_state_event(
            ctx=ctx,
            home_id=home_id,
            request_id=request_id,
            device_id=device_id,
            confirmation_type=confirmation_type,
            execution_status="FAILED",
            error_code=error_code,
            error_message=error_message,
            occurred_at=completed_at,
        )

    async def mark_succeeded(
        self,
        *,
        tx: Any,
        control_request_id: str,
        home_id: str,
        request_id: str,
        device_id: str,
        confirmation_type: str,
        completed_at: str,
    ) -> None:
        ctx = RepoContext(tx=tx)
        await self._device_control_request_repository.update_execution_result(
            DeviceControlResultUpdate(
                home_id=home_id,
                request_id=request_id,
                execution_status="SUCCESS",
                final_runtime_state_json=None,
                error_code=None,
                error_message=None,
                completed_at=completed_at,
            ),
            ctx=ctx,
        )
        await self._device_control_transition_repository.insert(
            NewDeviceControlTransitionRow(
                control_request_id=control_request_id,
                from_status="PENDING",
                to_status="SUCCESS",
                reason="HA_ACKNOWLEDGED",
                error_code=None,
                payload_json={"request_id": request_id},
            ),
            ctx=ctx,
        )
        await self._insert_state_event(
            ctx=ctx,
            home_id=home_id,
            request_id=request_id,
            device_id=device_id,
            confirmation_type=confirmation_type,
            execution_status="SUCCESS",
            error_code=None,
            error_message=None,
            occurred_at=completed_at,
        )

    async def _insert_state_event(
        self,
        *,
        ctx: RepoContext,
        home_id: str,
        request_id: str,
        device_id: str,
        confirmation_type: str,
        execution_status: str,
        error_code: str | None,
        error_message: str | None,
        occurred_at: str,
    ) -> None:
        await self._ws_event_outbox_repository.insert(
            NewWsEventOutboxRow(
                home_id=home_id,
                event_id=self._event_id_generator.next_event_id(),
                event_type="device_state_changed",
                change_domain="DEVICE_STATE",
                snapshot_required=False,
                payload_json={
                    "related_request_id": request_id,
                    "device_id": device_id,
                    "confirmation_type": confirmation_type,
                    "execution_status": execution_status,
                    "runtime_state": None,
                    "error_code": error_code,
                    "error_message": error_message,
                },
                occurred_at=occurred_at,
            ),
            ctx=ctx,
        )
