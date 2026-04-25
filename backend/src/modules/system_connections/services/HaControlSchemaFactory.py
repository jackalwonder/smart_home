from __future__ import annotations

from typing import Any

from src.modules.system_connections.services.HaEntityNormalizer import HaEntityNormalizer
from src.repositories.base.devices.DeviceControlSchemaRepository import NewDeviceControlSchemaRow


class HaControlSchemaFactory:
    def __init__(self, normalizer: HaEntityNormalizer | None = None) -> None:
        self._normalizer = normalizer or HaEntityNormalizer()

    def derive_control_schemas(
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
        for sort_order, entity_entry in enumerate(
            sorted(related_entities, key=lambda item: str(item["entity_id"]))
        ):
            entity_id = str(entity_entry["entity_id"])
            domain = self._normalizer.domain(entity_id)
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
