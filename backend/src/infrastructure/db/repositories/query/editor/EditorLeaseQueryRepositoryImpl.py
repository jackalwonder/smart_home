from __future__ import annotations

from datetime import datetime

from sqlalchemy import text

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories._support import session_scope
from src.repositories.query.editor.EditorLeaseQueryRepository import (
    EditorLeaseContextReadModel,
)
from src.repositories.read_models.index import DraftLeaseReadModel
from src.shared.kernel.RepoContext import RepoContext


class EditorLeaseQueryRepositoryImpl:
    def __init__(self, database: Database) -> None:
        self._database = database

    async def get_lease_context(
        self,
        home_id: str,
        terminal_id: str,
        now: datetime,
        ctx: RepoContext | None = None,
    ) -> EditorLeaseContextReadModel:
        async with session_scope(self._database, ctx) as (session, _):
            lease = (
                await session.execute(
                    text(
                        """
                        SELECT
                            lease_id,
                            terminal_id::text AS terminal_id,
                            member_id::text AS member_id,
                            lease_status::text AS lease_status,
                            is_active,
                            lease_expires_at::text AS lease_expires_at,
                            last_heartbeat_at::text AS last_heartbeat_at
                        FROM draft_leases
                        WHERE home_id = :home_id
                          AND is_active = true
                        ORDER BY created_at DESC
                        LIMIT 1
                        """
                    ),
                    {"home_id": home_id},
                )
            ).mappings().one_or_none()

        active_lease = (
            DraftLeaseReadModel(
                lease_id=lease["lease_id"],
                terminal_id=lease["terminal_id"],
                member_id=lease["member_id"],
                lease_status=lease["lease_status"],
                is_active=lease["is_active"],
                lease_expires_at=lease["lease_expires_at"],
                last_heartbeat_at=lease["last_heartbeat_at"],
            )
            if lease is not None
            else None
        )
        if active_lease is None:
            derived_status = "GRANTED"
        elif active_lease.terminal_id == terminal_id:
            expires_at = datetime.fromisoformat(active_lease.lease_expires_at)
            derived_status = "GRANTED" if expires_at > now else "LOST"
        else:
            derived_status = "LOCKED_BY_OTHER"
        return EditorLeaseContextReadModel(
            active_lease=active_lease,
            derived_lock_status=derived_status,
        )
