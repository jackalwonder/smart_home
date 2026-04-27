from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4


class SystemClock:
    def now(self) -> datetime:
        return datetime.now(timezone.utc)


class UuidEventIdGenerator:
    def next_event_id(self) -> str:
        return str(uuid4())


class UuidIdGenerator:
    def next_id(self) -> str:
        return str(uuid4())


class TimestampVersionTokenGenerator:
    def __init__(self, clock: SystemClock) -> None:
        self._clock = clock

    def _token(self, prefix: str) -> str:
        return f"{prefix}_{self._clock.now().strftime('%Y%m%d%H%M%S%f')}"

    def next_settings_version(self) -> str:
        return self._token("sv")

    def next_layout_version(self) -> str:
        return self._token("lv")

    def next_draft_version(self) -> str:
        return self._token("dv")
