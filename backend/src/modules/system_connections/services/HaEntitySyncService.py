from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from psycopg.types.json import Jsonb
from sqlalchemy import bindparam, text

from src.infrastructure.ha.HaConnectionGateway import HaRegistryEntry, HaStateEntry, HaSyncSnapshot
from src.repositories.base.devices.DeviceControlSchemaRepository import DeviceControlSchemaRepository
from src.repositories.base.devices.DeviceControlSchemaRepository import NewDeviceControlSchemaRow
from src.shared.kernel.Clock import Clock
from src.shared.kernel.RepoContext import RepoContext
from src.shared.kernel.RepoContext import DbTx

CONTROL_DOMAIN_PRIORITY = {
    "light": 100,
    "switch": 95,
    "climate": 90,
    "cover": 85,
    "fan": 80,
    "humidifier": 75,
    "vacuum": 70,
    "media_player": 65,
    "select": 40,
    "number": 35,
    "button": 20,
    "sensor": 10,
    "binary_sensor": 9,
    "event": 5,
    "notify": 4,
}

CONTROLLABLE_DOMAINS = {
    "light",
    "switch",
    "climate",
    "cover",
    "fan",
    "humidifier",
    "vacuum",
    "media_player",
    "select",
    "number",
    "button",
    "notify",
}


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
        device_control_schema_repository: DeviceControlSchemaRepository,
    ) -> None:
        self._clock = clock
        self._device_control_schema_repository = device_control_schema_repository

    def _domain(self, entity_id: str) -> str:
        return entity_id.split(".", 1)[0] if "." in entity_id else "sensor"

    def _infer_device_type(
        self,
        domains: set[str],
        model: str | None,
        name: str | None,
    ) -> str:
        model_text = (model or "").lower()
        name_text = (name or "").lower()
        if "light" in domains:
            return "LIGHT"
        if "climate" in domains:
            return "AC"
        if "cover" in domains:
            return "CURTAIN"
        if "fan" in domains:
            return "FAN"
        if "humidifier" in domains:
            return "HUMIDIFIER"
        if "vacuum" in domains:
            return "VACUUM"
        if "media_player" in domains:
            return "MUSIC"
        if "switch" in domains:
            return "SWITCH"
        if "fridge" in model_text or "冰箱" in name_text:
            return "FRIDGE"
        if "scale" in model_text or "秤" in name_text:
            return "SCALE"
        if "charger" in name_text or "充电器" in name_text:
            return "POWER"
        return "GENERIC"

    def _infer_entry_behavior(self, domains: set[str], readonly: bool) -> str:
        if readonly:
            return "OPEN_READONLY_CARD"
        if domains & {"media_player"}:
            return "OPEN_MEDIA_POPUP"
        if domains & {"climate", "cover", "fan", "humidifier", "vacuum"}:
            return "OPEN_COMPLEX_CARD"
        return "OPEN_CONTROL_CARD"

    def _entity_role(
        self,
        domain: str,
        is_primary: bool,
    ) -> str:
        if is_primary:
            return "PRIMARY_CONTROL" if domain in CONTROLLABLE_DOMAINS else "STATUS"
        if domain in {"sensor", "binary_sensor"}:
            return "TELEMETRY"
        if domain in CONTROLLABLE_DOMAINS:
            return "SECONDARY_CONTROL"
        if domain == "event":
            return "ALERT"
        return "STATUS"

    def _derive_control_schemas(
        self,
        device_id: str,
        related_entities: list[dict[str, Any]],
        states_by_entity_id: dict[str, dict[str, Any]],
        readonly: bool,
    ) -> list[NewDeviceControlSchemaRow]:
        if readonly:
            return []
        schemas: list[NewDeviceControlSchemaRow] = []
        seen_keys: set[tuple[str, str | None, str | None]] = set()
        for sort_order, entity_entry in enumerate(sorted(related_entities, key=lambda item: str(item["entity_id"]))):
            entity_id = str(entity_entry["entity_id"])
            domain = self._domain(entity_id)
            capabilities: dict[str, Any] = {}
            if isinstance(entity_entry.get("capabilities"), dict):
                capabilities.update(entity_entry["capabilities"])
            state_payload = states_by_entity_id.get(entity_id, {})
            attributes = state_payload.get("attributes")
            if isinstance(attributes, dict):
                capabilities.update(attributes)

            def add_schema(
                action_type: str,
                value_type: str,
                *,
                target_scope: str | None = "PRIMARY",
                target_key: str | None = entity_id,
                value_range_json: dict[str, Any] | None = None,
                allowed_values_json: list[Any] | None = None,
                unit: str | None = None,
                is_quick_action: bool = False,
                requires_detail_entry: bool = False,
            ) -> None:
                dedupe_key = (action_type, target_scope, target_key)
                if dedupe_key in seen_keys:
                    return
                seen_keys.add(dedupe_key)
                schemas.append(
                    NewDeviceControlSchemaRow(
                        device_id=device_id,
                        action_type=action_type,
                        target_scope=target_scope,
                        target_key=target_key,
                        value_type=value_type,
                        value_range_json=value_range_json,
                        allowed_values_json=allowed_values_json,
                        unit=unit,
                        is_quick_action=is_quick_action,
                        requires_detail_entry=requires_detail_entry,
                        sort_order=sort_order,
                    )
                )

            if domain in {"light", "switch"}:
                add_schema(
                    "SET_POWER_STATE",
                    "BOOLEAN",
                    is_quick_action=True,
                    requires_detail_entry=False,
                )
                continue
            if domain == "select":
                options = capabilities.get("options")
                if isinstance(options, list) and options:
                    add_schema(
                        "SET_MODE",
                        "ENUM",
                        allowed_values_json=options,
                        requires_detail_entry=True,
                    )
                continue
            if domain == "number":
                value_range = {}
                for key in ("min", "max", "step"):
                    value = capabilities.get(key)
                    if isinstance(value, (int, float)):
                        value_range[key] = value
                add_schema(
                    "SET_VALUE",
                    "NUMBER",
                    value_range_json=value_range or None,
                    unit=capabilities.get("unit_of_measurement")
                    if isinstance(capabilities.get("unit_of_measurement"), str)
                    else None,
                    requires_detail_entry=True,
                )
                continue
            if domain == "button":
                add_schema(
                    "EXECUTE_ACTION",
                    "NONE",
                    requires_detail_entry=False,
                )
                continue
            if domain == "cover":
                add_schema(
                    "SET_POSITION",
                    "NUMBER",
                    value_range_json={"min": 0, "max": 100, "step": 1},
                    unit="%",
                    requires_detail_entry=True,
                )
                continue
            if domain == "climate":
                add_schema(
                    "SET_TEMPERATURE",
                    "NUMBER",
                    value_range_json={
                        key: capabilities.get(key)
                        for key in ("min_temp", "max_temp", "target_temp_step")
                        if isinstance(capabilities.get(key), (int, float))
                    }
                    or None,
                    unit=capabilities.get("temperature_unit")
                    if isinstance(capabilities.get("temperature_unit"), str)
                    else None,
                    requires_detail_entry=True,
                )
                hvac_modes = capabilities.get("hvac_modes")
                if isinstance(hvac_modes, list) and hvac_modes:
                    add_schema(
                        "SET_MODE",
                        "ENUM",
                        allowed_values_json=hvac_modes,
                        requires_detail_entry=True,
                    )
                continue
            if domain == "media_player":
                add_schema(
                    "TOGGLE_POWER",
                    "BOOLEAN",
                    is_quick_action=True,
                    requires_detail_entry=False,
                )
        return schemas

    async def _load_existing_rooms(
        self,
        home_id: str,
        tx: DbTx,
    ) -> dict[str, str]:
        rows = (
            await tx.session.execute(
                text(
                    """
                    SELECT id::text AS id, room_name
                    FROM rooms
                    WHERE home_id = :home_id
                    """
                ),
                {"home_id": home_id},
            )
        ).mappings().all()
        return {str(row["room_name"]): str(row["id"]) for row in rows}

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
        row = (
            await tx.session.execute(
                text(
                    """
                    INSERT INTO rooms (
                        home_id,
                        room_name,
                        priority,
                        visible_in_editor,
                        sort_order,
                        created_at,
                        updated_at
                    ) VALUES (
                        :home_id,
                        :room_name,
                        0,
                        true,
                        0,
                        now(),
                        now()
                    )
                    ON CONFLICT (home_id, room_name) DO UPDATE
                    SET updated_at = now()
                    RETURNING id::text AS id
                    """
                ),
                {"home_id": home_id, "room_name": room_name},
            )
        ).mappings().one()
        rooms_by_name[room_name] = str(row["id"])
        return str(row["id"])

    async def _load_existing_devices(
        self,
        home_id: str,
        tx: DbTx,
    ) -> dict[str, str]:
        rows = (
            await tx.session.execute(
                text(
                    """
                    SELECT
                        id::text AS id,
                        source_meta_json ->> 'ha_device_id' AS ha_device_id
                    FROM devices
                    WHERE home_id = :home_id
                    """
                ),
                {"home_id": home_id},
            )
        ).mappings().all()
        return {
            str(row["ha_device_id"]): str(row["id"])
            for row in rows
            if row["ha_device_id"] is not None
        }

    async def _load_existing_entities(
        self,
        home_id: str,
        entity_ids: list[str],
        tx: DbTx,
    ) -> dict[str, str]:
        if not entity_ids:
            return {}
        rows = (
            await tx.session.execute(
                text(
                    """
                    SELECT id::text AS id, entity_id
                    FROM ha_entities
                    WHERE home_id = :home_id
                      AND entity_id IN :entity_ids
                    """
                ).bindparams(bindparam("entity_ids", expanding=True)),
                {"home_id": home_id, "entity_ids": entity_ids},
            )
        ).mappings().all()
        return {str(row["entity_id"]): str(row["id"]) for row in rows}

    async def _rebuild_runtime_state(
        self,
        home_id: str,
        device_id: str,
        tx: DbTx,
    ) -> IncrementalStateSyncResult | None:
        rows = (
            await tx.session.execute(
                text(
                    """
                    SELECT
                        d.id::text AS device_id,
                        d.home_id::text AS home_id,
                        d.display_name,
                        d.device_type,
                        he.entity_id,
                        he.domain,
                        he.state,
                        he.attributes_json,
                        he.last_state_changed_at::text AS last_state_changed_at,
                        del.is_primary,
                        del.sort_order
                    FROM devices d
                    JOIN device_entity_links del ON del.device_id = d.id
                    JOIN ha_entities he ON he.id = del.ha_entity_id
                    WHERE d.home_id = :home_id
                      AND d.id = :device_id
                    ORDER BY del.is_primary DESC, del.sort_order ASC, he.entity_id ASC
                    """
                ),
                {"home_id": home_id, "device_id": device_id},
            )
        ).mappings().all()
        if not rows:
            return None

        primary = rows[0]
        status = str(primary["state"] or "unknown")
        await tx.session.execute(
            text(
                """
                INSERT INTO device_runtime_states (
                    device_id,
                    home_id,
                    status,
                    is_offline,
                    status_summary_json,
                    runtime_state_json,
                    last_state_update_at,
                    updated_at
                ) VALUES (
                    :device_id,
                    :home_id,
                    :status,
                    :is_offline,
                    :status_summary_json,
                    :runtime_state_json,
                    :last_state_update_at,
                    now()
                )
                ON CONFLICT (device_id) DO UPDATE SET
                    home_id = EXCLUDED.home_id,
                    status = EXCLUDED.status,
                    is_offline = EXCLUDED.is_offline,
                    status_summary_json = EXCLUDED.status_summary_json,
                    runtime_state_json = EXCLUDED.runtime_state_json,
                    last_state_update_at = EXCLUDED.last_state_update_at,
                    updated_at = now()
                """
            ),
            {
                "device_id": str(primary["device_id"]),
                "home_id": str(primary["home_id"]),
                "status": status,
                "is_offline": status in {"unavailable", "offline"},
                "status_summary_json": Jsonb(
                    {
                        "friendly_name": str(primary["display_name"]),
                        "primary_domain": str(primary["domain"]),
                        "state": status,
                    }
                ),
                "runtime_state_json": Jsonb(
                    {
                        "entity_id": str(primary["entity_id"]),
                        "state": status,
                        "attributes": primary["attributes_json"]
                        if isinstance(primary["attributes_json"], dict)
                        else {},
                    }
                ),
                "last_state_update_at": primary["last_state_changed_at"],
            },
        )
        device_type = str(primary["device_type"])
        return IncrementalStateSyncResult(
            home_id=str(primary["home_id"]),
            device_id=str(primary["device_id"]),
            entity_id=str(primary["entity_id"]),
            device_type=device_type,
            event_type="media_state_changed" if device_type in {"MUSIC", "MEDIA_PLAYER"} else "device_state_changed",
            status=status,
            occurred_at=primary["last_state_changed_at"],
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
        result = (
            await tx.session.execute(
                text(
                    """
                    SELECT
                        he.id::text AS ha_entity_id,
                        he.state AS current_state,
                        he.last_state_changed_at::text AS current_last_state_changed_at,
                        del.device_id::text AS device_id
                    FROM ha_entities he
                    JOIN device_entity_links del ON del.ha_entity_id = he.id
                    WHERE he.home_id = :home_id
                      AND he.entity_id = :entity_id
                    """
                ),
                {"home_id": home_id, "entity_id": str(entity_id)},
            )
        ).mappings().one_or_none()
        if result is None:
            return None
        next_changed_at = (
            new_state.get("last_changed")
            or new_state.get("last_updated")
            or occurred_at
        )
        if (
            str(result["current_state"] or "unknown") == state_value
            and result["current_last_state_changed_at"] == next_changed_at
        ):
            return None

        await tx.session.execute(
            text(
                """
                UPDATE ha_entities
                SET
                    state = :state,
                    attributes_json = :attributes_json,
                    last_synced_at = now(),
                    last_state_changed_at = :last_state_changed_at,
                    is_available = :is_available,
                    updated_at = now()
                WHERE id = :ha_entity_id
                """
            ),
            {
                "ha_entity_id": str(result["ha_entity_id"]),
                "state": state_value,
                "attributes_json": Jsonb(attributes if isinstance(attributes, dict) else {}),
                "last_state_changed_at": next_changed_at,
                "is_available": state_value not in {"unavailable", "offline"},
            },
        )
        return await self._rebuild_runtime_state(home_id, str(result["device_id"]), tx)

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
                    self._domain(str(entry["entity_id"])),
                    0,
                ),
            )
            primary_domain = self._domain(str(primary_entity["entity_id"]))
            domains = {self._domain(str(entry["entity_id"])) for entry in related_entities}
            readonly = not bool(domains & CONTROLLABLE_DOMAINS)
            device_name = (
                device_entry.get("name_by_user")
                or device_entry.get("name")
                or states_by_entity_id.get(str(primary_entity["entity_id"]), {})
                .get("attributes", {})
                .get("friendly_name")
                or str(primary_entity["entity_id"])
            )
            device_type = self._infer_device_type(
                domains,
                device_entry.get("model"),
                device_name,
            )
            entry_behavior = self._infer_entry_behavior(domains, readonly)
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

            if ha_device_id in devices_by_ha_device_id:
                device_id = devices_by_ha_device_id[ha_device_id]
                await tx.session.execute(
                    text(
                        """
                        UPDATE devices
                        SET
                            room_id = :room_id,
                            display_name = :display_name,
                            raw_name = :raw_name,
                            device_type = :device_type,
                            is_complex_device = :is_complex_device,
                            is_readonly_device = :is_readonly_device,
                            entry_behavior = :entry_behavior,
                            default_control_target = :default_control_target,
                            is_homepage_visible = true,
                            capabilities_json = :capabilities_json,
                            source_meta_json = :source_meta_json,
                            updated_at = now()
                        WHERE id = :device_id
                        """
                    ),
                    {
                        "device_id": device_id,
                        "room_id": room_id,
                        "display_name": device_name,
                        "raw_name": device_entry.get("model"),
                        "device_type": device_type,
                        "is_complex_device": len(related_entities) > 1,
                        "is_readonly_device": readonly,
                        "entry_behavior": entry_behavior,
                        "default_control_target": primary_domain,
                        "capabilities_json": Jsonb(capabilities_json),
                        "source_meta_json": Jsonb(source_meta_json),
                    },
                )
            else:
                row = (
                    await tx.session.execute(
                        text(
                            """
                            INSERT INTO devices (
                                home_id,
                                room_id,
                                display_name,
                                raw_name,
                                device_type,
                                is_complex_device,
                                is_readonly_device,
                                confirmation_type,
                                entry_behavior,
                                default_control_target,
                                is_primary_device,
                                is_homepage_visible,
                                capabilities_json,
                                source_meta_json,
                                created_at,
                                updated_at
                            ) VALUES (
                                :home_id,
                                :room_id,
                                :display_name,
                                :raw_name,
                                :device_type,
                                :is_complex_device,
                                :is_readonly_device,
                                'ACK_DRIVEN',
                                :entry_behavior,
                                :default_control_target,
                                false,
                                true,
                                :capabilities_json,
                                :source_meta_json,
                                now(),
                                now()
                            )
                            RETURNING id::text AS id
                            """
                        ),
                        {
                            "home_id": home_id,
                            "room_id": room_id,
                            "display_name": device_name,
                            "raw_name": device_entry.get("model"),
                            "device_type": device_type,
                            "is_complex_device": len(related_entities) > 1,
                            "is_readonly_device": readonly,
                            "entry_behavior": entry_behavior,
                            "default_control_target": primary_domain,
                            "capabilities_json": Jsonb(capabilities_json),
                            "source_meta_json": Jsonb(source_meta_json),
                        },
                    )
                ).mappings().one()
                device_id = str(row["id"])
                devices_by_ha_device_id[ha_device_id] = device_id

            synced_device_ids.append(device_id)
            current_linked_entity_ids: list[str] = []
            derived_control_schemas = self._derive_control_schemas(
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
            await tx.session.execute(
                text(
                    """
                    INSERT INTO device_runtime_states (
                        device_id,
                        home_id,
                        status,
                        is_offline,
                        status_summary_json,
                        runtime_state_json,
                        last_state_update_at,
                        updated_at
                    ) VALUES (
                        :device_id,
                        :home_id,
                        :status,
                        :is_offline,
                        :status_summary_json,
                        :runtime_state_json,
                        :last_state_update_at,
                        now()
                    )
                    ON CONFLICT (device_id) DO UPDATE SET
                        home_id = EXCLUDED.home_id,
                        status = EXCLUDED.status,
                        is_offline = EXCLUDED.is_offline,
                        status_summary_json = EXCLUDED.status_summary_json,
                        runtime_state_json = EXCLUDED.runtime_state_json,
                        last_state_update_at = EXCLUDED.last_state_update_at,
                        updated_at = now()
                    """
                ),
                {
                    "device_id": device_id,
                    "home_id": home_id,
                    "status": primary_status,
                    "is_offline": primary_status in {"unavailable", "offline"},
                    "status_summary_json": Jsonb(
                        {
                            "friendly_name": device_name,
                            "primary_domain": primary_domain,
                            "state": primary_status,
                        }
                    ),
                    "runtime_state_json": Jsonb(
                        {
                            "entity_id": primary_entity["entity_id"],
                            "state": primary_status,
                            "attributes": primary_attrs,
                        }
                    ),
                    "last_state_update_at": primary_state.get("last_updated")
                    or primary_state.get("last_changed"),
                },
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
                if entity_id in entities_by_entity_id:
                    ha_entity_id = entities_by_entity_id[entity_id]
                    await tx.session.execute(
                        text(
                            """
                            UPDATE ha_entities
                            SET
                                platform = :platform,
                                domain = :domain,
                                raw_name = :raw_name,
                                state = :state,
                                attributes_json = :attributes_json,
                                last_synced_at = now(),
                                last_state_changed_at = :last_state_changed_at,
                                room_hint = :room_hint,
                                is_available = :is_available,
                                updated_at = now()
                            WHERE id = :id
                            """
                        ),
                        {
                            "id": ha_entity_id,
                            "platform": "xiaomi_home",
                            "domain": self._domain(entity_id),
                            "raw_name": attributes.get("friendly_name")
                            or entity_entry.get("original_name")
                            or entity_entry.get("name"),
                            "state": state_value,
                            "attributes_json": Jsonb(attributes),
                            "last_state_changed_at": state_payload.get("last_changed")
                            or state_payload.get("last_updated"),
                            "room_hint": room_hint,
                            "is_available": state_value not in {"unavailable", "offline"},
                        },
                    )
                else:
                    row = (
                        await tx.session.execute(
                            text(
                                """
                                INSERT INTO ha_entities (
                                    home_id,
                                    entity_id,
                                    platform,
                                    domain,
                                    raw_name,
                                    state,
                                    attributes_json,
                                    last_synced_at,
                                    last_state_changed_at,
                                    room_hint,
                                    is_available,
                                    created_at,
                                    updated_at
                                ) VALUES (
                                    :home_id,
                                    :entity_id,
                                    :platform,
                                    :domain,
                                    :raw_name,
                                    :state,
                                    :attributes_json,
                                    now(),
                                    :last_state_changed_at,
                                    :room_hint,
                                    :is_available,
                                    now(),
                                    now()
                                )
                                ON CONFLICT (home_id, entity_id) DO UPDATE SET
                                    platform = EXCLUDED.platform,
                                    domain = EXCLUDED.domain,
                                    raw_name = EXCLUDED.raw_name,
                                    state = EXCLUDED.state,
                                    attributes_json = EXCLUDED.attributes_json,
                                    last_synced_at = now(),
                                    last_state_changed_at = EXCLUDED.last_state_changed_at,
                                    room_hint = EXCLUDED.room_hint,
                                    is_available = EXCLUDED.is_available,
                                    updated_at = now()
                                RETURNING id::text AS id
                                """
                            ),
                            {
                                "home_id": home_id,
                                "entity_id": entity_id,
                                "platform": "xiaomi_home",
                                "domain": self._domain(entity_id),
                                "raw_name": attributes.get("friendly_name")
                                or entity_entry.get("original_name")
                                or entity_entry.get("name"),
                                "state": state_value,
                                "attributes_json": Jsonb(attributes),
                                "last_state_changed_at": state_payload.get("last_changed")
                                or state_payload.get("last_updated"),
                                "room_hint": room_hint,
                                "is_available": state_value not in {"unavailable", "offline"},
                            },
                        )
                    ).mappings().one()
                    ha_entity_id = str(row["id"])
                    entities_by_entity_id[entity_id] = ha_entity_id

                current_linked_entity_ids.append(ha_entity_id)
                linked_entity_count += 1
                await tx.session.execute(
                    text(
                        """
                        INSERT INTO device_entity_links (
                            home_id,
                            device_id,
                            ha_entity_id,
                            entity_role,
                            is_primary,
                            sort_order,
                            created_at,
                            updated_at
                        ) VALUES (
                            :home_id,
                            :device_id,
                            :ha_entity_id,
                            :entity_role,
                            :is_primary,
                            :sort_order,
                            now(),
                            now()
                        )
                        ON CONFLICT (ha_entity_id) DO UPDATE SET
                            home_id = EXCLUDED.home_id,
                            device_id = EXCLUDED.device_id,
                            entity_role = EXCLUDED.entity_role,
                            is_primary = EXCLUDED.is_primary,
                            sort_order = EXCLUDED.sort_order,
                            updated_at = now()
                        """
                    ),
                    {
                        "home_id": home_id,
                        "device_id": device_id,
                        "ha_entity_id": ha_entity_id,
                        "entity_role": self._entity_role(
                            self._domain(entity_id),
                            entity_id == str(primary_entity["entity_id"]),
                        ),
                        "is_primary": entity_id == str(primary_entity["entity_id"]),
                        "sort_order": sort_order,
                    },
                )

            if current_linked_entity_ids:
                await tx.session.execute(
                    text(
                        """
                        DELETE FROM device_entity_links
                        WHERE device_id = :device_id
                          AND ha_entity_id NOT IN :ha_entity_ids
                        """
                    ).bindparams(bindparam("ha_entity_ids", expanding=True)),
                    {"device_id": device_id, "ha_entity_ids": current_linked_entity_ids},
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
