from __future__ import annotations

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import as_dict, session_scope, to_jsonb
from src.repositories.base.control.DeviceControlRequestRepository import (
    DeviceControlResultUpdate,
    NewDeviceControlRequestRow,
)
from src.repositories.rows.index import DeviceControlRequestRow
from src.shared.kernel.RepoContext import RepoContext


def _to_request_row(row) -> DeviceControlRequestRow:
    return DeviceControlRequestRow(
        id=row["id"],
        home_id=row["home_id"],
        request_id=row["request_id"],
        device_id=row["device_id"],
        action_type=row["action_type"],
        payload_json=as_dict(row["payload_json"]),
        acceptance_status=row["acceptance_status"],
        confirmation_type=row["confirmation_type"],
        execution_status=row["execution_status"],
        timeout_seconds=row["timeout_seconds"],
        final_runtime_state_json=as_dict(row["final_runtime_state_json"])
        if row["final_runtime_state_json"] is not None
        else None,
        error_code=row["error_code"],
        error_message=row["error_message"],
        accepted_at=row["accepted_at"],
        completed_at=row["completed_at"],
    )


class DeviceControlRequestRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def find_by_request_id(
        self,
        home_id: str,
        request_id: str,
        ctx: RepoContext | None = None,
    ) -> DeviceControlRequestRow | None:
        stmt = text(
            """
            SELECT
                id::text AS id,
                home_id::text AS home_id,
                request_id,
                device_id::text AS device_id,
                action_type,
                payload_json,
                acceptance_status::text AS acceptance_status,
                confirmation_type::text AS confirmation_type,
                execution_status::text AS execution_status,
                timeout_seconds,
                final_runtime_state_json,
                error_code,
                error_message,
                accepted_at::text AS accepted_at,
                completed_at::text AS completed_at
            FROM device_control_requests
            WHERE home_id = :home_id
              AND request_id = :request_id
            """
        )
        async with session_scope(self._database, ctx) as (session, _):
            row = (
                await session.execute(
                    stmt,
                    {"home_id": home_id, "request_id": request_id},
                )
            ).mappings().one_or_none()
        return _to_request_row(row) if row is not None else None

    async def insert(
        self,
        input: NewDeviceControlRequestRow,
        ctx: RepoContext | None = None,
    ) -> DeviceControlRequestRow:
        stmt = text(
            """
            INSERT INTO device_control_requests (
                home_id,
                request_id,
                device_id,
                action_type,
                payload_json,
                client_ts,
                acceptance_status,
                confirmation_type,
                execution_status,
                timeout_seconds,
                accepted_at
            ) VALUES (
                :home_id,
                :request_id,
                :device_id,
                :action_type,
                :payload_json,
                :client_ts,
                :acceptance_status,
                :confirmation_type,
                :execution_status,
                :timeout_seconds,
                now()
            )
            RETURNING
                id::text AS id,
                home_id::text AS home_id,
                request_id,
                device_id::text AS device_id,
                action_type,
                payload_json,
                acceptance_status::text AS acceptance_status,
                confirmation_type::text AS confirmation_type,
                execution_status::text AS execution_status,
                timeout_seconds,
                final_runtime_state_json,
                error_code,
                error_message,
                accepted_at::text AS accepted_at,
                completed_at::text AS completed_at
            """
        )
        async with session_scope(self._database, ctx) as (session, owned):
            row = (
                await session.execute(
                    stmt,
                    {
                        "home_id": input.home_id,
                        "request_id": input.request_id,
                        "device_id": input.device_id,
                        "action_type": input.action_type,
                        "payload_json": to_jsonb(as_dict(input.payload_json)),
                        "client_ts": input.client_ts,
                        "acceptance_status": input.acceptance_status,
                        "confirmation_type": input.confirmation_type,
                        "execution_status": input.execution_status,
                        "timeout_seconds": input.timeout_seconds,
                    },
                )
            ).mappings().one()
            if owned:
                await session.commit()
        return _to_request_row(row)

    async def update_execution_result(
        self,
        input: DeviceControlResultUpdate,
        ctx: RepoContext | None = None,
    ) -> None:
        stmt = text(
            """
            UPDATE device_control_requests
            SET
                execution_status = :execution_status,
                final_runtime_state_json = :final_runtime_state_json,
                error_code = :error_code,
                error_message = :error_message,
                completed_at = :completed_at,
                updated_at = now()
            WHERE home_id = :home_id
              AND request_id = :request_id
            """
        )
        async with session_scope(self._database, ctx) as (session, owned):
            await session.execute(
                stmt,
                {
                    "home_id": input.home_id,
                    "request_id": input.request_id,
                    "execution_status": input.execution_status,
                    "final_runtime_state_json": (
                        to_jsonb(input.final_runtime_state_json)
                        if input.final_runtime_state_json is not None
                        else None
                    ),
                    "error_code": input.error_code,
                    "error_message": input.error_message,
                    "completed_at": input.completed_at,
                },
            )
            if owned:
                await session.commit()
