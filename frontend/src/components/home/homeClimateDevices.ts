import type { DeviceListItemDto } from "../../api/types";
import type { HomeHotspotViewModel } from "../../view-models/home";

function normalizeDeviceKeyword(value: string | null | undefined) {
  return (value ?? "").toLowerCase();
}

export function isClimateDevice(device: DeviceListItemDto) {
  const source = normalizeDeviceKeyword(device.device_type);
  return (
    source.includes("climate") ||
    source.includes("air") ||
    source.includes("fan") ||
    source.includes("fridge") ||
    source.includes("refrigerator")
  );
}

export function formatClimateDeviceType(value: string | null | undefined) {
  const source = normalizeDeviceKeyword(value);
  if (source.includes("fridge") || source.includes("refrigerator")) {
    return "冰箱";
  }
  if (source.includes("air") || source.includes("climate")) {
    return "空调";
  }
  if (source.includes("fan")) {
    return "新风";
  }
  return "温控设备";
}

export function formatDeviceControlBadge(device: DeviceListItemDto) {
  if (device.is_offline) {
    return device.is_readonly_device ? "离线 · 只读" : "离线 · 待恢复";
  }
  return device.is_readonly_device ? "在线 · 只读" : "在线 · 可控";
}

export function deviceListItemToHotspot(device: DeviceListItemDto): HomeHotspotViewModel {
  return {
    id: `cluster-${device.device_id}`,
    deviceId: device.device_id,
    label: device.display_name,
    deviceType: device.device_type,
    deviceTypeLabel: device.device_type,
    x: 0,
    y: 0,
    iconGlyph: "温",
    tone: "accent",
    iconType: "device",
    iconAssetId: null,
    iconAssetUrl: null,
    labelMode: "ALWAYS",
    status: device.status,
    statusLabel: device.is_offline ? "离线" : device.status,
    statusSummary: null,
    isOffline: device.is_offline,
    isComplex: device.is_complex_device,
    isReadonly: device.is_readonly_device,
    entryBehavior: "VIEW",
    entryBehaviorLabel: "查看",
  };
}
