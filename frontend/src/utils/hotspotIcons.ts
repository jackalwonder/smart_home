export type HotspotIconKey =
  | "lightbulb"
  | "fan"
  | "air-vent"
  | "refrigerator"
  | "thermometer"
  | "blinds"
  | "tv"
  | "sensor"
  | "switch"
  | "device";

export const HOTSPOT_ICON_OPTIONS: Array<{ value: HotspotIconKey; label: string }> = [
  { value: "device", label: "Device" },
  { value: "lightbulb", label: "Light" },
  { value: "fan", label: "Fan" },
  { value: "air-vent", label: "Air" },
  { value: "refrigerator", label: "Fridge" },
  { value: "thermometer", label: "Thermostat" },
  { value: "blinds", label: "Blinds" },
  { value: "tv", label: "TV" },
  { value: "sensor", label: "Sensor" },
  { value: "switch", label: "Switch" },
];

export function normalizeHotspotIconKeyword(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

export function deriveHotspotIconKey(
  iconType: string | null | undefined,
  deviceType: string | null | undefined,
): HotspotIconKey {
  const source = `${iconType ?? ""} ${deviceType ?? ""}`.toLowerCase();
  if (source.includes("light") || source.includes("lamp")) {
    return "lightbulb";
  }
  if (source.includes("fan")) {
    return "fan";
  }
  if (source.includes("climate") || source.includes("air") || source.includes("ac")) {
    return "air-vent";
  }
  if (source.includes("fridge") || source.includes("refrigerator")) {
    return "refrigerator";
  }
  if (source.includes("thermostat") || source.includes("temperature")) {
    return "thermometer";
  }
  if (source.includes("curtain") || source.includes("cover") || source.includes("blind")) {
    return "blinds";
  }
  if (source.includes("media") || source.includes("tv") || source.includes("television")) {
    return "tv";
  }
  if (source.includes("sensor")) {
    return "sensor";
  }
  if (source.includes("switch")) {
    return "switch";
  }
  return "device";
}

export function isHotspotRunning(status: string | null | undefined, isOffline = false) {
  if (isOffline) {
    return false;
  }
  const normalized = normalizeHotspotIconKeyword(status);
  return (
    normalized.includes("on") ||
    normalized.includes("open") ||
    normalized.includes("running") ||
    normalized.includes("active") ||
    normalized.includes("cool") ||
    normalized.includes("heat")
  );
}

export function shouldSpinHotspotIcon(input: {
  iconType: string | null | undefined;
  deviceType: string | null | undefined;
  status: string | null | undefined;
  isOffline?: boolean;
}) {
  const key = deriveHotspotIconKey(input.iconType, input.deviceType);
  return (
    (key === "fan" || key === "air-vent") && isHotspotRunning(input.status, input.isOffline)
  );
}
