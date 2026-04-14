from __future__ import annotations

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import as_dict, session_scope, to_jsonb
from src.repositories.base.control.DeviceControlTransitionRepository import (
    NewDeviceControlTransitionRow,
)
from src.repositories.rows.index import DeviceControlTransitionRow
from src.shared.kernel.RepoContext import RepoContext


def _to_transition_row(row) -> DeviceControlTransitionRow:
    return DeviceControlTransitionRow(
        id=row["id"],
        control_request_id=row["control_request_id"],
        from_status=row["from_status"],
        to_status=row["to_status"],
        reason=row["reason"],
        error_code=row["error_code"],
        payload_json=as_dict(row["payload_json"]),
        created_at=row["created_at"],
    )


class DeviceControlTransitionRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def insert(
        self,
        input: NewDeviceControlTransitionRow,
        ctx: RepoContext | None = None,
    ) -> DeviceControlTransitionRow:
        stmt = text(
            """
            INSERT INTO device_control_request_transitions (
                control_request_id,
                from_status,
                to_status,
                reason,
                error_code,
                payload_json
            ) VALUES (
                :control_request_id,
                :from_status,
                :to_status,
                :reason,
                :error_code,
                :payload_json
            )
            RETURNING
                id::text AS id,
                control_request_id::text AS control_request_id,
                from_status::text AS from_status,
                to_status::text AS to_status,
                reason,
                error_code,
                payload_json,
                created_at::text AS created_at
            """
        )
        async with session_scope(self._database, ctx) as (session, owned):
            row = (
                await session.execute(
                    stmt,
                    {
                        "control_request_id": input.control_request_id,
                        "from_status": input.from_status,
                        "to_status": input.to_status,
                        "reason": input.reason,
                        "error_code": input.error_code,
                        "payload_json": to_jsonb(as_dict(input.payload_json)),
                    },
                )
            ).mappings().one()
            if owned:
                await session.commit()
        return _to_transition_row(row)

    async def list_by_control_request_id(
        self,
        control_request_id: str,
        ctx: RepoContext | None = None,
    ) -> list[DeviceControlTransitionRow]:
        stmt = text(
            """
            SELECT
                id::text AS id,
                control_request_id::text AS control_request_id,
                from_status::text AS from_status,
                to_status::text AS to_status,
                reason,
                error_code,
                payload_json,
                created_at::text AS created_at
            FROM device_control_request_transitions
            WHERE control_request_id = :control_request_id
            ORDER BY created_at ASC
            """
        )
        async with session_scope(self._database, ctx) as (session, _):
            rows = (
                await session.execute(stmt, {"control_request_id": control_request_id})
            ).mappings().all()
        return [_to_transition_row(row) for row in rows]
