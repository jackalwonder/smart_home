from __future__ import annotations

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import as_dict, session_scope
from src.repositories.read_models.index import DeviceControlResultReadModel
from src.shared.kernel.RepoContext import RepoContext


class DeviceControlQueryRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def get_control_result(
        self,
        home_id: str,
        request_id: str,
        ctx: RepoContext | None = None,
    ) -> DeviceControlResultReadModel | None:
        stmt = text(
            """
            SELECT
                request_id,
                device_id::text AS device_id,
                action_type,
                payload_json,
                acceptance_status::text AS acceptance_status,
                confirmation_type::text AS confirmation_type,
                execution_status::text AS execution_status,
                timeout_seconds,
                COALESCE((
                    SELECT COUNT(*)::int
                    FROM device_control_request_transitions transitions
                    WHERE transitions.control_request_id = device_control_requests.id
                      AND transitions.reason = 'RETRY_SCHEDULED'
                ), 0) AS retry_count,
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
        if row is None:
            return None
        return DeviceControlResultReadModel(
            request_id=row["request_id"],
            device_id=row["device_id"],
            action_type=row["action_type"],
            payload=as_dict(row["payload_json"]),
            acceptance_status=row["acceptance_status"],
            confirmation_type=row["confirmation_type"],
            execution_status=row["execution_status"],
            retry_count=row["retry_count"] or 0,
            final_runtime_state=as_dict(row["final_runtime_state_json"])
            if row["final_runtime_state_json"] is not None
            else None,
            error_code=row["error_code"],
            error_message=row["error_message"],
            accepted_at=row["accepted_at"],
            completed_at=row["completed_at"],
        )
