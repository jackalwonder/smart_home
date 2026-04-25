from __future__ import annotations

import json
from typing import Any


def stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def has_same_request_semantics(
    *,
    existing,
    device_id: str,
    action_type: str,
    payload: dict[str, Any],
) -> bool:
    return (
        existing.device_id == device_id
        and existing.action_type == action_type
        and stable_json(existing.payload_json) == stable_json(payload)
    )
