from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from src.modules.system_connections.services.HaEntitySyncService import HaEntitySyncService
from src.repositories.base.system.HaEntitySyncRepository import (
    HaEntityStateUpdateInput,
    HaRuntimeStateInput,
    RuntimeEntityLinkRow,
    StateChangedEntityLinkRow,
)


class _Clock:
    def now(self):
        return datetime(2026, 4, 20, 8, 0, 0, tzinfo=timezone.utc)


class _SchemaRepository:
    async def replace_for_device(self, *_args, **_kwargs):
        return None


class _HaSyncRepository:
    def __init__(self):
        self.link_row: StateChangedEntityLinkRow | None = None
        self.runtime_rows: list[RuntimeEntityLinkRow] = []
        self.state_updates: list[HaEntityStateUpdateInput] = []
        self.runtime_upserts: list[HaRuntimeStateInput] = []

    async def find_state_changed_entity(self, *_args, **_kwargs):
        return self.link_row

    async def update_ha_entity_state(self, input, *_args, **_kwargs):
        self.state_updates.append(input)

    async def list_runtime_entity_links(self, *_args, **_kwargs):
        return self.runtime_rows

    async def upsert_runtime_state(self, input, *_args, **_kwargs):
        self.runtime_upserts.append(input)


def _run(coro):
    return asyncio.run(coro)


def _service(repository: _HaSyncRepository):
    return HaEntitySyncService(
        clock=_Clock(),
        ha_entity_sync_repository=repository,
        device_control_schema_repository=_SchemaRepository(),
    )


def test_state_changed_skips_when_state_and_timestamp_are_unchanged():
    repository = _HaSyncRepository()
    repository.link_row = StateChangedEntityLinkRow(
        ha_entity_id="ha-1",
        current_state="on",
        current_last_state_changed_at="2026-04-20T08:00:00+00:00",
        device_id="device-1",
    )
    service = _service(repository)

    result = _run(
        service.apply_state_changed(
            "home-1",
            {
                "entity_id": "light.kitchen",
                "new_state": {
                    "state": "on",
                    "last_changed": "2026-04-20T08:00:00+00:00",
                },
            },
            None,
            object(),
        )
    )

    assert result is None
    assert repository.state_updates == []
    assert repository.runtime_upserts == []


def test_state_changed_updates_entity_and_rebuilds_runtime_state():
    repository = _HaSyncRepository()
    repository.link_row = StateChangedEntityLinkRow(
        ha_entity_id="ha-1",
        current_state="off",
        current_last_state_changed_at="2026-04-20T07:59:00+00:00",
        device_id="device-1",
    )
    repository.runtime_rows = [
        RuntimeEntityLinkRow(
            device_id="device-1",
            home_id="home-1",
            display_name="Kitchen light",
            device_type="LIGHT",
            entity_id="light.kitchen",
            domain="light",
            state="on",
            attributes_json={"brightness": 200},
            last_state_changed_at="2026-04-20T08:00:00+00:00",
            is_primary=True,
            sort_order=0,
        )
    ]
    service = _service(repository)

    result = _run(
        service.apply_state_changed(
            "home-1",
            {
                "entity_id": "light.kitchen",
                "new_state": {
                    "state": "on",
                    "attributes": {"brightness": 200},
                    "last_changed": "2026-04-20T08:00:00+00:00",
                },
            },
            None,
            object(),
        )
    )

    assert result is not None
    assert result.event_type == "device_state_changed"
    assert result.status == "on"
    assert repository.state_updates[0].ha_entity_id == "ha-1"
    assert repository.state_updates[0].attributes_json == {"brightness": 200}
    assert repository.runtime_upserts[0].runtime_state_json == {
        "entity_id": "light.kitchen",
        "state": "on",
        "attributes": {"brightness": 200},
    }
