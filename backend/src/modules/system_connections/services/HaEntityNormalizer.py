from __future__ import annotations


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


class HaEntityNormalizer:
    def domain(self, entity_id: str) -> str:
        return entity_id.split(".", 1)[0] if "." in entity_id else "sensor"

    def infer_device_type(
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

    def infer_entry_behavior(self, domains: set[str], readonly: bool) -> str:
        if readonly:
            return "OPEN_READONLY_CARD"
        if domains & {"media_player"}:
            return "OPEN_MEDIA_POPUP"
        if domains & {"climate", "cover", "fan", "humidifier", "vacuum"}:
            return "OPEN_COMPLEX_CARD"
        return "OPEN_CONTROL_CARD"

    def entity_role(
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
