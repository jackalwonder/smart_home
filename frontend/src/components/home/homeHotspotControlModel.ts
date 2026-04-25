import {
  DeviceControlSchemaItemDto,
  DeviceDetailDto,
  DeviceListItemDto,
} from "../../api/types";
import { HomeHotspotViewModel } from "../../view-models/home";
import {
  isPowerControlSchema,
  normalizeControlKeyword,
} from "./deviceControlHelpers";

export type HotspotControlMode = "detail" | "group";

export interface DeviceCandidate {
  deviceId: string;
  displayName: string;
  roomId: string | null;
  roomName: string | null;
  deviceType: string;
  status: string;
  isOffline: boolean;
  isReadonly: boolean;
  isComplex: boolean;
}

export type HotspotGroupKind = "lighting" | "climate" | "cover" | "media" | "device";

export function deviceKind(deviceType: string): HotspotGroupKind {
  const source = normalizeControlKeyword(deviceType);
  if (source.includes("light") || source.includes("lamp") || source.includes("switch")) {
    return "lighting";
  }
  if (
    source.includes("climate") ||
    source.includes("air") ||
    source.includes("fan") ||
    source.includes("fridge") ||
    source.includes("refrigerator")
  ) {
    return "climate";
  }
  if (source.includes("cover") || source.includes("curtain") || source.includes("blind")) {
    return "cover";
  }
  if (source.includes("media") || source.includes("tv") || source.includes("speaker")) {
    return "media";
  }
  return "device";
}

export function kindTitle(kind: HotspotGroupKind, mode: HotspotControlMode) {
  if (mode === "detail") {
    switch (kind) {
      case "lighting":
        return "灯光控制";
      case "climate":
        return "温控控制";
      case "cover":
        return "窗帘控制";
      case "media":
        return "媒体控制";
      default:
        return "设备控制";
    }
  }

  switch (kind) {
    case "lighting":
      return "常用灯光";
    case "climate":
      return "常用温控";
    case "cover":
      return "窗帘控制";
    case "media":
      return "媒体控制";
    default:
      return "同房间控制";
  }
}

export function candidateFromDevice(device: DeviceListItemDto): DeviceCandidate {
  return {
    deviceId: device.device_id,
    displayName: device.display_name,
    roomId: device.room_id ?? null,
    roomName: device.room_name ?? null,
    deviceType: device.device_type,
    status: device.status,
    isOffline: device.is_offline,
    isReadonly: device.is_readonly_device,
    isComplex: device.is_complex_device,
  };
}

export function candidateFromHotspot(hotspot: HomeHotspotViewModel): DeviceCandidate {
  return {
    deviceId: hotspot.deviceId,
    displayName: hotspot.label,
    roomId: null,
    roomName: null,
    deviceType: hotspot.deviceType,
    status: hotspot.status,
    isOffline: hotspot.isOffline,
    isReadonly: hotspot.isReadonly,
    isComplex: hotspot.isComplex,
  };
}

export function sameRoom(device: DeviceCandidate, anchor: DeviceCandidate) {
  if (anchor.roomId) {
    return device.roomId === anchor.roomId;
  }
  if (anchor.roomName) {
    return device.roomName === anchor.roomName;
  }
  return false;
}

export function buildTargetCandidates(
  devices: DeviceListItemDto[],
  hotspot: HomeHotspotViewModel | null,
  mode: HotspotControlMode,
) {
  if (!hotspot) {
    return [];
  }

  const anchor = devices.find((device) => device.device_id === hotspot.deviceId) ?? null;
  const anchorCandidate = anchor ? candidateFromDevice(anchor) : candidateFromHotspot(hotspot);

  if (mode === "detail") {
    return [anchorCandidate];
  }

  const groupKind = deviceKind(anchorCandidate.deviceType);
  const sameRoomSameKind = devices
    .map(candidateFromDevice)
    .filter(
      (device) =>
        sameRoom(device, anchorCandidate) && deviceKind(device.deviceType) === groupKind,
    );

  const hasAnchor = sameRoomSameKind.some(
    (device) => device.deviceId === anchorCandidate.deviceId,
  );
  const candidates = sameRoomSameKind.length
    ? hasAnchor
      ? sameRoomSameKind
      : [anchorCandidate, ...sameRoomSameKind]
    : [anchorCandidate];

  return candidates.slice(0, 24);
}

export function detailState(detail: DeviceDetailDto | null, fallback: DeviceCandidate) {
  return detail?.runtime_state?.aggregated_state ?? detail?.status ?? fallback.status;
}

export function rangeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function isNumberControlSchema(schema: DeviceControlSchemaItemDto) {
  const type = schema.value_type?.toUpperCase() ?? "NONE";
  return (
    Boolean(schema.value_range) ||
    type.includes("NUMBER") ||
    type.includes("INT") ||
    type.includes("FLOAT")
  );
}

function isTemperatureSchema(schema: DeviceControlSchemaItemDto) {
  const source = normalizeControlKeyword(
    `${schema.action_type} ${schema.target_scope ?? ""} ${schema.target_key ?? ""}`,
  );
  return source.includes("temperature") || source.includes("temp");
}

function isBrightnessSchema(schema: DeviceControlSchemaItemDto) {
  const source = normalizeControlKeyword(
    `${schema.action_type} ${schema.target_scope ?? ""} ${schema.target_key ?? ""}`,
  );
  return source.includes("brightness");
}

function isModeSchema(schema: DeviceControlSchemaItemDto) {
  const source = normalizeControlKeyword(
    `${schema.action_type} ${schema.target_scope ?? ""} ${schema.target_key ?? ""}`,
  );
  return source.includes("mode") || source.includes("preset");
}

function controlSchemaSource(schema: DeviceControlSchemaItemDto) {
  return normalizeControlKeyword(
    `${schema.action_type} ${schema.target_scope ?? ""} ${schema.target_key ?? ""}`,
  );
}

function temperatureSchemaTitle(schema: DeviceControlSchemaItemDto) {
  const min = rangeNumber(schema.value_range?.min);
  const max = rangeNumber(schema.value_range?.max);
  const source = controlSchemaSource(schema);

  if (max !== undefined && max <= 0) {
    return "冷冻室温度";
  }
  if (min !== undefined && min >= 0) {
    return "冷藏室温度";
  }
  if (source.includes("freeze") || source.includes("freezer")) {
    return "冷冻室温度";
  }
  if (source.includes("fridge") || source.includes("refrigerator")) {
    return "冷藏室温度";
  }
  return "目标温度";
}

export function actionSchemaTitle(schema: DeviceControlSchemaItemDto) {
  const source = controlSchemaSource(schema);

  if (source.includes("reset")) {
    return "重置";
  }
  return "执行动作";
}

export function getInitialValue(schema: DeviceControlSchemaItemDto) {
  const type = schema.value_type?.toUpperCase() ?? "NONE";
  if (Array.isArray(schema.allowed_values) && schema.allowed_values.length > 0) {
    return schema.allowed_values[0];
  }
  if (isPowerControlSchema(schema)) {
    return true;
  }
  const min = rangeNumber(schema.value_range?.min);
  if (min !== undefined) {
    return min;
  }
  if (isNumberControlSchema(schema)) {
    return 0;
  }
  if (type === "NONE") {
    return null;
  }
  return "";
}

export function optionLabel(value: unknown) {
  const normalized = normalizeControlKeyword(String(value));
  const map: Record<string, string> = {
    auto: "自动",
    cool: "制冷",
    heat: "制热",
    dry: "除湿",
    fan: "送风",
    manual: "手动",
    smart: "智能",
    holiday: "假日",
    away: "离家",
    eco: "节能",
    sleep: "睡眠",
    high: "高",
    medium: "中",
    mid: "中",
    low: "低",
    on: "开启",
    off: "关闭",
    true: "开启",
    false: "关闭",
  };
  return map[normalized] ?? String(value);
}

export function schemaTitle(schema: DeviceControlSchemaItemDto) {
  const source = controlSchemaSource(schema);
  if (isTemperatureSchema(schema)) {
    return temperatureSchemaTitle(schema);
  }
  if (isBrightnessSchema(schema)) {
    return "亮度";
  }
  if (isModeSchema(schema)) {
    return "模式";
  }
  if (isPowerControlSchema(schema)) {
    return "电源开关";
  }
  if (source.includes("fan") || source.includes("speed")) {
    return "风速";
  }
  if (source.includes("position") || source.includes("cover")) {
    return "开合位置";
  }
  if ((schema.value_type?.toUpperCase() ?? "NONE") === "NONE") {
    return "执行动作";
  }
  return "控制项";
}

export function resultMessage(status: string | undefined, nextValue?: unknown) {
  if (!status || status === "SUCCESS") {
    if (typeof nextValue === "boolean") {
      return nextValue ? "ON" : "OFF";
    }
    return "已应用";
  }
  return status;
}
