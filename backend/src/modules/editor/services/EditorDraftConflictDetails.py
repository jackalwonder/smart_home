from __future__ import annotations

from datetime import datetime
from typing import Any


class EditorDraftConflictDetails:
    def __init__(self, *, clock, lease_validator) -> None:
        self._clock = clock
        self._lease_validator = lease_validator

    def lock_lost_details(self, *, lease, input) -> dict[str, Any]:
        now: datetime = self._clock.now()
        if lease is None:
            reason = "LEASE_NOT_FOUND"
        elif not lease.is_active:
            reason = "LEASE_INACTIVE"
        elif lease.terminal_id != input.terminal_id:
            reason = "TERMINAL_MISMATCH"
        elif not self._lease_validator(lease, now):
            reason = "LEASE_EXPIRED"
        else:
            reason = "LEASE_UNAVAILABLE"

        details: dict[str, Any] = {
            "reason": reason,
            "lease_id": input.lease_id,
            "terminal_id": input.terminal_id,
        }
        if lease is not None:
            details["active_lease"] = {
                "lease_id": lease.lease_id,
                "terminal_id": lease.terminal_id,
                "lease_status": lease.lease_status,
                "lease_expires_at": lease.lease_expires_at,
            }
        return details

    def version_conflict_details(
        self,
        *,
        draft,
        submitted: dict[str, str | None],
    ) -> dict[str, Any]:
        return {
            "reason": "DRAFT_VERSION_MISMATCH",
            "submitted": submitted,
            "current": {
                "draft_version": draft.draft_version if draft is not None else None,
                "base_layout_version": draft.base_layout_version if draft is not None else None,
            },
        }
