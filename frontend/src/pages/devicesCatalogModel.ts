import { DeviceDetailDto, DeviceEntityLinkDto, DeviceListItemDto } from "../api/types";
import {
  describeControlSchema,
  formatControlAction,
  formatControlOption,
  formatControlRange,
  formatControlTarget,
  formatControlValueType,
} from "../utils/controlSchemaFormatting";
import {
  buildNextFavorites,
  buildSettingsSaveInput,
  getNextFavoriteOrder,
  normalizeFavorites,
} from "../utils/deviceFavorites";

export {
  buildNextFavorites,
  buildSettingsSaveInput,
  describeControlSchema,
  formatControlAction,
  formatControlOption,
  formatControlRange,
  formatControlTarget,
  formatControlValueType,
  getNextFavoriteOrder,
  normalizeFavorites,
};

export type OfflineFilter = "ALL" | "ONLINE" | "OFFLINE";
export type HomeEntryAction = "add" | "remove";
export type HomeEntryFeedback = { tone: "success" | "error"; text: string } | null;

export interface DeviceCatalogStats {
  onlineCount: number;
  offlineCount: number;
  readonlyCount: number;
  homeEntryCount: number;
}

export function getStatusLabel(device: DeviceListItemDto): string {
  if (device.is_offline) {
    return "离线";
  }
  return formatDeviceStatus(device.status);
}

export function getStatusTone(device: DeviceListItemDto): "online" | "offline" {
  return device.is_offline ? "offline" : "online";
}

export function getHomeEntryLabel(device: DeviceListItemDto): string {
  if (device.is_favorite) {
    return "已在首页";
  }
  if (device.is_favorite_candidate) {
    return "可加入首页";
  }
  return device.favorite_exclude_reason || "不可加入首页";
}

export function formatDeviceStatus(value: string | null | undefined): string {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "unknown") {
    return "状态未知";
  }
  if (normalized === "online" || normalized === "active") {
    return "在线";
  }
  if (normalized === "offline" || normalized === "unavailable") {
    return "离线";
  }
  if (normalized === "smart") {
    return "智能";
  }
  return value ?? "状态未知";
}

export function formatDeviceType(value: string | null | undefined): string {
  const normalized = (value ?? "").trim().toUpperCase();
  const labels: Record<string, string> = {
    CLIMATE: "温控",
    FRIDGE: "冰箱",
    LIGHT: "灯光",
    MEDIA: "媒体",
    POWER: "电源",
    SCALE: "体脂秤",
    SENSOR: "传感器",
    SWITCH: "开关",
  };
  return labels[normalized] ?? (value ? value : "未分类");
}

export function formatDeviceTimestamp(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  const hour = String(parsed.getHours()).padStart(2, "0");
  const minute = String(parsed.getMinutes()).padStart(2, "0");
  return `${parsed.getMonth() + 1}月${parsed.getDate()}日 ${hour}:${minute}`;
}

export function compactJson(value: unknown): string {
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value, null, 2);
}

export function formatShortId(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  return value.length > 12 ? `...${value.slice(-8)}` : value;
}

export function getEntityLinks(detail: DeviceDetailDto): DeviceEntityLinkDto[] {
  const links = detail.source_info.entity_links;
  return Array.isArray(links) ? links : [];
}

export function formatEntityDomain(value: string | null | undefined) {
  const normalized = (value ?? "").toLowerCase();
  const labels: Record<string, string> = {
    binary_sensor: "二元传感器",
    button: "按钮动作",
    climate: "温控",
    event: "事件",
    light: "灯光",
    media_player: "媒体播放器",
    notify: "通知动作",
    number: "数值控制",
    select: "选项控制",
    sensor: "传感器",
    switch: "开关",
  };
  return labels[normalized] ?? (value || "-");
}

export function formatEntityRole(value: string | null | undefined) {
  const normalized = (value ?? "").toLowerCase();
  const labels: Record<string, string> = {
    alert: "事件通知",
    battery: "电量",
    mode: "模式",
    power: "开关",
    primary: "主实体",
    primary_control: "主控制",
    secondary_control: "辅助控制",
    status: "状态",
    temperature: "温度",
  };
  return labels[normalized] ?? (value || "-");
}

export function filterDevicesByOfflineStatus(
  devices: DeviceListItemDto[],
  offlineFilter: OfflineFilter,
) {
  if (offlineFilter === "ONLINE") {
    return devices.filter((device) => !device.is_offline);
  }
  if (offlineFilter === "OFFLINE") {
    return devices.filter((device) => device.is_offline);
  }
  return devices;
}

export function buildCatalogStats(devices: DeviceListItemDto[]): DeviceCatalogStats {
  const onlineCount = devices.filter((device) => !device.is_offline).length;
  const offlineCount = devices.length - onlineCount;
  const readonlyCount = devices.filter((device) => device.is_readonly_device).length;
  const homeEntryCount = devices.filter((device) => device.is_favorite).length;
  return {
    onlineCount,
    offlineCount,
    readonlyCount,
    homeEntryCount,
  };
}
