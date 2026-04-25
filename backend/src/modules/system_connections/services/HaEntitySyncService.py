from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from src.infrastructure.ha.HaConnectionGateway import HaSyncSnapshot
from src.modules.system_connections.services.HaControlSchemaFactory import (
    HaControlSchemaFactory,
)
from src.modules.system_connections.services.HaEntityNormalizer import (
    CONTROLLABLE_DOMAINS,
    CONTROL_DOMAIN_PRIORITY,
    HaEntityNormalizer,
)
from src.repositories.base.devices.DeviceControlSchemaRepository import DeviceControlSchemaRepository
from src.repositories.base.system.HaEntitySyncRepository import (
    DeviceEntityLinkSaveInput,
    HaDeviceSaveInput,
    HaEntitySaveInput,
    HaEntityStateUpdateInput,
    HaEntitySyncRepository,
    HaRuntimeStateInput,
)
from src.shared.kernel.Clock import Clock
from src.shared.kernel.RepoContext import DbTx
from src.shared.kernel.RepoContext import RepoContext


@dataclass(frozen=True)
class HaSyncSummary:
    room_count: int
    entity_count: int
    device_count: int
    linked_entity_count: int


@dataclass(frozen=True)
class IncrementalStateSyncResult:
    home_id: str
    device_id: str
    entity_id: str
    device_type: str
    event_type: str
    status: str
    occurred_at: str | None


class HaEntitySyncService:
    def __init__(
        self,
        clock: Clock,
        ha_entity_sync_repository: HaEntitySyncRepository,
        device_control_schema_repository: DeviceControlSchemaRepository,
        normalizer: HaEntityNormalizer | None = None,
        control_schema_factory: HaControlSchemaFactory | None = None,
    ) -> None:
        self._clock = clock
        self._ha_entity_sync_repository = ha_entity_sync_repository
        self._device_control_schema_repository = device_control_schema_repository
        self._normalizer = normalizer or HaEntityNormalizer()
        self._control_schema_factory = control_schema_factory or HaControlSchemaFactory(
            self._normalizer
        )

    async def _load_existing_rooms(
        self,
        home_id: str,
        tx: DbTx,
    ) -> dict[str, str]:
        return await self._ha_entity_sync_repository.load_existing_rooms(
            home_id,
            RepoContext(tx=tx),
        )

    async def _ensure_room(
        self,
        home_id: str,
        room_name: str | None,
        rooms_by_name: dict[str, str],
        tx: DbTx,
    ) -> str | None:
        if not room_name:
            return None
        if room_name in rooms_by_name:
            return rooms_by_name[room_name]
        room_id = await self._ha_entity_sync_repository.ensure_room(
            home_id,
            room_name,
            RepoContext(tx=tx),
        )
        rooms_by_name[room_name] = room_id
        return room_id

    async def _load_existing_devices(
        self,
        home_id: str,
        tx: DbTx,
    ) -> dict[str, str]:
        return await self._ha_entity_sync_repository.load_existing_devices(
            home_id,
            RepoContext(tx=tx),
        )

    async def _load_existing_entities(
        self,
        home_id: str,
        entity_ids: list[str],
        tx: DbTx,
    ) -> dict[str, str]:
        return await self._ha_entity_sync_repository.load_existing_entities(
            home_id,
            entity_ids,
            RepoContext(tx=tx),
        )

    async def _rebuild_runtime_state(
        self,
        home_id: str,
        device_id: str,
        tx: DbTx,
    ) -> IncrementalStateSyncResult | None:
        rows = await self._ha_entity_sync_repository.list_runtime_entity_links(
            home_id,
            device_id,
            RepoContext(tx=tx),
        )
        if not rows:
            return None

        primary = rows[0]
        status = str(primary.state or "unknown")
        await self._ha_entity_sync_repository.upsert_runtime_state(
            HaRuntimeStateInput(
                device_id=primary.device_id,
                home_id=primary.home_id,
                status=status,
                is_offline=status in {"unavailable", "offline"},
                status_summary_json={
                    "friendly_name": primary.display_name,
                    "primary_domain": primary.domain,
                    "state": status,
                },
                runtime_state_json={
                    "entity_id": primary.entity_id,
                    "state": status,
                    "attributes": primary.attributes_json,
                },
                last_state_update_at=primary.last_state_changed_at,
            ),
            RepoContext(tx=tx),
        )
        device_type = primary.device_type
        return IncrementalStateSyncResult(
            home_id=primary.home_id,
            device_id=primary.device_id,
            entity_id=primary.entity_id,
            device_type=device_type,
            event_type="media_state_changed" if device_type in {"MUSIC", "MEDIA_PLAYER"} else "device_state_changed",
            status=status,
            occurred_at=primary.last_state_changed_at,
        )

    async def apply_state_changed(
        self,
        home_id: str,
        payload: dict[str, Any],
        occurred_at: str | None,
        tx: DbTx,
    ) -> IncrementalStateSyncResult | None:
        entity_id = payload.get("entity_id")
        if not entity_id:
            return None
        new_state = payload.get("new_state")
        if not isinstance(new_state, dict):
            return None
        attributes = new_state.get("attributes")
        state_value = str(new_state.get("state") or "unknown")
        next_changed_at = (
            new_state.get("last_changed")
            or new_state.get("last_updated")
            or occurred_at
        )
        result = await self._ha_entity_sync_repository.find_state_changed_entity(
            home_id,
            str(entity_id),
            RepoContext(tx=tx),
        )
        if result is None:
            return None
        if (
            str(result.current_state or "unknown") == state_value
            and result.current_last_state_changed_at == next_changed_at
        ):
            return None

        await self._ha_entity_sync_repository.update_ha_entity_state(
            HaEntityStateUpdateInput(
                ha_entity_id=result.ha_entity_id,
                state=state_value,
                attributes_json=attributes if isinstance(attributes, dict) else {},
                last_state_changed_at=next_changed_at,
                is_available=state_value not in {"unavailable", "offline"},
            ),
            RepoContext(tx=tx),
        )
        return await self._rebuild_runtime_state(home_id, result.device_id, tx)

    async def sync_home(
        self,
        home_id: str,
        snapshot: HaSyncSnapshot,
        tx: DbTx,
    ) -> HaSyncSummary:
        entity_entries = [
            entry.payload
            for entry in snapshot.entity_registry
            if entry.payload.get("platform") == "xiaomi_home"
            and entry.payload.get("device_id")
            and entry.payload.get("entity_id")
        ]
        device_ids = {str(entry["device_id"]) for entry in entity_entries}
        device_entries = {
            str(entry.payload["id"]): entry.payload
            for entry in snapshot.device_registry
            if str(entry.payload.get("id")) in device_ids
        }
        area_entries = {
            str(entry.payload["area_id"]): entry.payload
            for entry in snapshot.area_registry
            if entry.payload.get("area_id")
        }
        states_by_entity_id = {
            str(state.payload["entity_id"]): state.payload
            for state in snapshot.states
            if state.payload.get("entity_id")
        }

        rooms_by_name = await self._load_existing_rooms(home_id, tx)
        devices_by_ha_device_id = await self._load_existing_devices(home_id, tx)
        entities_by_entity_id = await self._load_existing_entities(
            home_id,
            [str(entry["entity_id"]) for entry in entity_entries],
            tx,
        )

        device_groups: dict[str, list[dict[str, Any]]] = {}
        for entry in entity_entries:
            device_groups.setdefault(str(entry["device_id"]), []).append(entry)

        synced_device_ids: list[str] = []
        linked_entity_count = 0

        for ha_device_id, related_entities in device_groups.items():
            device_entry = device_entries.get(ha_device_id)
            if device_entry is None:
                continue
            area_name = None
            if device_entry.get("area_id"):
                area_name = area_entries.get(str(device_entry["area_id"]), {}).get("name")
            room_id = await self._ensure_room(home_id, area_name, rooms_by_name, tx)

            primary_entity = max(
                related_entities,
                key=lambda entry: CONTROL_DOMAIN_PRIORITY.get(
                    self._normalizer.domain(str(entry["entity_id"])),
                    0,
                ),
            )
            primary_domain = self._normalizer.domain(str(primary_entity["entity_id"]))
            domains = {
                self._normalizer.domain(str(entry["entity_id"]))
                for entry in related_entities
            }
            readonly = not bool(domains & CONTROLLABLE_DOMAINS)
            device_name = (
                device_entry.get("name_by_user")
                or device_entry.get("name")
                or states_by_entity_id.get(str(primary_entity["entity_id"]), {})
                .get("attributes", {})
                .get("friendly_name")
                or str(primary_entity["entity_id"])
            )
            device_type = self._normalizer.infer_device_type(
                domains,
                device_entry.get("model"),
                device_name,
            )
            entry_behavior = self._normalizer.infer_entry_behavior(domains, readonly)
            source_meta_json = {
                "ha_device_id": ha_device_id,
                "ha_area_id": device_entry.get("area_id"),
                "ha_identifiers": device_entry.get("identifiers", []),
                "ha_model": device_entry.get("model"),
                "ha_manufacturer": device_entry.get("manufacturer"),
                "ha_configuration_url": device_entry.get("configuration_url"),
            }
            capabilities_json = {
                "ha_domains": sorted(domains),
                "entity_count": len(related_entities),
            }

            device_id = await self._ha_entity_sync_repository.save_device(
                home_id,
                devices_by_ha_device_id.get(ha_device_id),
                HaDeviceSaveInput(
                    room_id=room_id,
                    display_name=device_name,
                    raw_name=device_entry.get("model"),
                    device_type=device_type,
                    is_complex_device=len(related_entities) > 1,
                    is_readonly_device=readonly,
                    entry_behavior=entry_behavior,
                    default_control_target=primary_domain,
                    capabilities_json=capabilities_json,
                    source_meta_json=source_meta_json,
                ),
                RepoContext(tx=tx),
            )
            devices_by_ha_device_id[ha_device_id] = device_id

            synced_device_ids.append(device_id)
            current_linked_entity_ids: list[str] = []
            derived_control_schemas = self._control_schema_factory.derive_control_schemas(
                device_id,
                related_entities,
                states_by_entity_id,
                readonly,
            )

            primary_state = states_by_entity_id.get(str(primary_entity["entity_id"]), {})
            primary_attrs = (
                primary_state.get("attributes")
                if isinstance(primary_state.get("attributes"), dict)
                else {}
            )
            primary_status = str(primary_state.get("state") or "unknown")
            await self._ha_entity_sync_repository.upsert_runtime_state(
                HaRuntimeStateInput(
                    device_id=device_id,
                    home_id=home_id,
                    status=primary_status,
                    is_offline=primary_status in {"unavailable", "offline"},
                    status_summary_json={
                        "friendly_name": device_name,
                        "primary_domain": primary_domain,
                        "state": primary_status,
                    },
                    runtime_state_json={
                        "entity_id": primary_entity["entity_id"],
                        "state": primary_status,
                        "attributes": primary_attrs,
                    },
                    last_state_update_at=primary_state.get("last_updated")
                    or primary_state.get("last_changed"),
                ),
                RepoContext(tx=tx),
            )

            for sort_order, entity_entry in enumerate(
                sorted(related_entities, key=lambda item: str(item["entity_id"]))
            ):
                entity_id = str(entity_entry["entity_id"])
                state_payload = states_by_entity_id.get(entity_id, {})
                attributes = (
                    state_payload.get("attributes")
                    if isinstance(state_payload.get("attributes"), dict)
                    else {}
                )
                room_hint = area_name
                state_value = str(state_payload.get("state") or "unknown")
                ha_entity_id = await self._ha_entity_sync_repository.save_ha_entity(
                    home_id,
                    entity_id,
                    entities_by_entity_id.get(entity_id),
                    HaEntitySaveInput(
                        platform="xiaomi_home",
                        domain=self._normalizer.domain(entity_id),
                        raw_name=attributes.get("friendly_name")
                        or entity_entry.get("original_name")
                        or entity_entry.get("name"),
                        state=state_value,
                        attributes_json=attributes,
                        last_state_changed_at=state_payload.get("last_changed")
                        or state_payload.get("last_updated"),
                        room_hint=room_hint,
                        is_available=state_value not in {"unavailable", "offline"},
                    ),
                    RepoContext(tx=tx),
                )
                entities_by_entity_id[entity_id] = ha_entity_id

                current_linked_entity_ids.append(ha_entity_id)
                linked_entity_count += 1
                await self._ha_entity_sync_repository.upsert_device_entity_link(
                    DeviceEntityLinkSaveInput(
                        home_id=home_id,
                        device_id=device_id,
                        ha_entity_id=ha_entity_id,
                        entity_role=self._normalizer.entity_role(
                            self._normalizer.domain(entity_id),
                            entity_id == str(primary_entity["entity_id"]),
                        ),
                        is_primary=entity_id == str(primary_entity["entity_id"]),
                        sort_order=sort_order,
                    ),
                    RepoContext(tx=tx),
                )

            if current_linked_entity_ids:
                await self._ha_entity_sync_repository.delete_stale_device_entity_links(
                    device_id,
                    current_linked_entity_ids,
                    RepoContext(tx=tx),
                )
            await self._device_control_schema_repository.replace_for_device(
                device_id,
                derived_control_schemas,
                ctx=RepoContext(tx=tx),
            )

        return HaSyncSummary(
            room_count=len(rooms_by_name),
            entity_count=len(entity_entries),
            device_count=len(synced_device_ids),
            linked_entity_count=linked_entity_count,
        )
