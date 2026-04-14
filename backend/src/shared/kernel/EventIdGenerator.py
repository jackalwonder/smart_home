from __future__ import annotations

from typing import Protocol


class EventIdGenerator(Protocol):
    def next_event_id(self) -> str: ...
