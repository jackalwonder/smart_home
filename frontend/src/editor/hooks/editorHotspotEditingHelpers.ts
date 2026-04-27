import { DeviceListItemDto } from "../../api/types";
import { deriveHotspotIconKey } from "../../utils/hotspotIcons";
import type { EditorHotspotViewModel } from "../../view-models/editor";

export function buildDeviceHotspotId(deviceId: string) {
  const normalized = deviceId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48);
  return `draft-device-${normalized}-${Date.now()}`;
}

export function getNextHotspotPosition(index: number) {
  const column = index % 4;
  const row = Math.floor(index / 4);
  return {
    x: Math.min(0.2 + column * 0.2, 0.8),
    y: Math.min(0.25 + row * 0.16, 0.85),
  };
}

export function clampPosition(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

export function isTextEditingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export function buildEmptyHotspot(order: number): EditorHotspotViewModel {
  return {
    id: `draft-hotspot-${Date.now()}`,
    label: `热点 ${order}`,
    deviceId: "",
    x: 0.5,
    y: 0.5,
    iconType: "device",
    iconAssetId: null,
    iconAssetUrl: null,
    labelMode: "AUTO",
    isVisible: true,
    structureOrder: order - 1,
  };
}

export function buildDeviceHotspot(
  device: DeviceListItemDto,
  order: number,
): EditorHotspotViewModel {
  const position = getNextHotspotPosition(order - 1);
  return {
    id: buildDeviceHotspotId(device.device_id),
    label: device.display_name,
    deviceId: device.device_id,
    x: position.x,
    y: position.y,
    iconType: deriveHotspotIconKey(device.device_type, device.device_type),
    iconAssetId: null,
    iconAssetUrl: null,
    labelMode: "AUTO",
    isVisible: true,
    structureOrder: order - 1,
  };
}

export function buildDuplicatedHotspot(
  source: EditorHotspotViewModel,
  order: number,
): EditorHotspotViewModel {
  return {
    ...source,
    id: `${source.id}-copy-${Date.now()}`,
    label: `${source.label} 副本`,
    x: Math.min(source.x + 0.04, 1),
    y: Math.min(source.y + 0.04, 1),
    structureOrder: order - 1,
  };
}

export function applyHotspotFieldUpdate(
  hotspot: EditorHotspotViewModel,
  field: EditorHotspotField,
  value: string,
  deviceCatalog: DeviceListItemDto[],
): EditorHotspotViewModel {
  if (field === "x" || field === "y") {
    const next = Math.min(Math.max(Number(value) / 100, 0), 1);
    return {
      ...hotspot,
      [field]: Number.isFinite(next) ? next : hotspot[field],
    };
  }

  if (field === "structureOrder") {
    const next = Number(value);
    return {
      ...hotspot,
      structureOrder: Number.isFinite(next)
        ? Math.max(0, Math.round(next))
        : hotspot.structureOrder,
    };
  }

  if (field === "label") {
    return { ...hotspot, label: value };
  }

  if (field === "deviceId") {
    const device = deviceCatalog.find((item) => item.device_id === value);
    return {
      ...hotspot,
      deviceId: value,
      label: device?.display_name ?? hotspot.label,
    };
  }

  if (field === "iconType") {
    return {
      ...hotspot,
      iconType: value,
      iconAssetId: null,
      iconAssetUrl: null,
    };
  }

  return { ...hotspot, [field]: value };
}

export type EditorHotspotField =
  | "label"
  | "deviceId"
  | "iconType"
  | "labelMode"
  | "x"
  | "y"
  | "structureOrder";
