from __future__ import annotations

from src.modules.system_connections.services.HaControlSchemaFactory import (
    HaControlSchemaFactory,
)
from src.modules.system_connections.services.HaEntityNormalizer import HaEntityNormalizer


def test_ha_entity_normalizer_infers_domain_type_behavior_and_role():
    normalizer = HaEntityNormalizer()

    assert normalizer.domain("light.kitchen") == "light"
    assert normalizer.domain("unknown_entity") == "sensor"
    assert normalizer.infer_device_type({"climate"}, None, "Bedroom AC") == "AC"
    assert normalizer.infer_device_type({"sensor"}, "smart scale", None) == "SCALE"
    assert normalizer.infer_entry_behavior({"media_player"}, readonly=False) == "OPEN_MEDIA_POPUP"
    assert normalizer.infer_entry_behavior({"sensor"}, readonly=True) == "OPEN_READONLY_CARD"
    assert normalizer.entity_role("light", is_primary=True) == "PRIMARY_CONTROL"
    assert normalizer.entity_role("sensor", is_primary=False) == "TELEMETRY"


def test_ha_control_schema_factory_derives_expected_schemas():
    normalizer = HaEntityNormalizer()
    factory = HaControlSchemaFactory(normalizer)

    schemas = factory.derive_control_schemas(
        "device-1",
        [
            {"entity_id": "climate.bedroom"},
            {"entity_id": "select.mode", "capabilities": {"options": ["eco", "heat"]}},
            {"entity_id": "number.target", "capabilities": {"min": 1, "max": 9, "step": 1}},
            {"entity_id": "light.main"},
        ],
        {
            "climate.bedroom": {
                "attributes": {
                    "min_temp": 16,
                    "max_temp": 30,
                    "target_temp_step": 0.5,
                    "hvac_modes": ["cool", "heat"],
                }
            }
        },
        readonly=False,
    )

    by_action = {(schema.action_type, schema.target_key): schema for schema in schemas}
    assert by_action[("SET_POWER_STATE", "light.main")].is_quick_action is True
    assert by_action[("SET_MODE", "select.mode")].allowed_values_json == ["eco", "heat"]
    assert by_action[("SET_VALUE", "number.target")].value_range_json == {
        "min": 1,
        "max": 9,
        "step": 1,
    }
    assert by_action[("SET_TEMPERATURE", "climate.bedroom")].value_range_json == {
        "min_temp": 16,
        "max_temp": 30,
        "target_temp_step": 0.5,
    }


def test_ha_control_schema_factory_skips_readonly_devices():
    factory = HaControlSchemaFactory()

    assert (
        factory.derive_control_schemas(
            "device-1",
            [{"entity_id": "light.main"}],
            {},
            readonly=True,
        )
        == []
    )
