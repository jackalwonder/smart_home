import {
  DeviceControlSchemaItemDto,
  DeviceDetailDto,
  DeviceEntityLinkDto,
  DeviceListItemDto,
  SettingsDto,
  SettingsSaveInput,
} from "../api/types";

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
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
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

export function describeControlSchema(schema: DeviceControlSchemaItemDto) {
  const target = formatControlTarget(schema);
  const value = schema.allowed_values?.length
    ? schema.allowed_values.map(formatControlOption).join("、")
    : schema.value_range
      ? formatControlRange(schema.value_range, schema.unit)
      : formatControlValueType(schema.value_type);
  return { target: target || "-", value };
}

export function formatControlAction(value: string | null | undefined) {
  const normalized = (value ?? "").toUpperCase();
  const labels: Record<string, string> = {
    EXECUTE_ACTION: "执行动作",
    RESET: "重置",
    SET_BRIGHTNESS: "调节亮度",
    SET_MODE: "切换模式",
    SET_TEMPERATURE: "设置温度",
    TOGGLE: "开关切换",
    TOGGLE_POWER: "开关切换",
    TURN_OFF: "关闭",
    TURN_ON: "开启",
  };
  return labels[normalized] ?? (value ? value.replaceAll("_", " ") : "控制项");
}

export function formatControlTarget(schema: DeviceControlSchemaItemDto) {
  const source = `${schema.target_scope ?? ""} ${schema.target_key ?? ""}`.toLowerCase();
  const scope = (schema.target_scope ?? "").toUpperCase();
  const targetKey = (schema.target_key ?? "").toLowerCase();
  if (source.includes("fridge") || source.includes("refrigerator")) {
    return "冷藏室温度";
  }
  if (source.includes("freezer") || source.includes("freeze")) {
    return "冷冻室温度";
  }
  if (source.includes("temperature") || source.includes("temp")) {
    return "温度";
  }
  if (source.includes("brightness")) {
    return "亮度";
  }
  if (source.includes("mode")) {
    return "模式";
  }
  if (source.includes("power") || source.includes("switch")) {
    return "开关";
  }
  if (scope === "PRIMARY") {
    return "主操作";
  }
  if (targetKey.startsWith("button.") || targetKey.includes(".button.")) {
    return "设备动作";
  }
  if (schema.target_scope || schema.target_key) {
    return "设备控制";
  }
  return "设备控制";
}

export function formatControlOption(value: unknown) {
  const normalized = String(value).toLowerCase();
  const labels: Record<string, string> = {
    auto: "自动",
    boost: "速冷",
    holiday: "假日",
    manual: "手动",
    none: "无需输入",
    off: "关闭",
    on: "开启",
    smart: "智能",
    super_cool: "速冷",
    super_freeze: "速冻",
  };
  return labels[normalized] ?? String(value);
}

export function formatControlValueType(value: string | null | undefined) {
  const normalized = (value ?? "").toUpperCase();
  const labels: Record<string, string> = {
    BOOLEAN: "开关值",
    FLOAT: "数字",
    INTEGER: "整数",
    NONE: "无需输入",
    NUMBER: "数字",
    STRING: "文本",
  };
  return labels[normalized] ?? (value ? value.replaceAll("_", " ") : "无需输入");
}

export function formatControlRange(value: unknown, unit?: string | null) {
  if (!value || typeof value !== "object") {
    return compactJson(value);
  }
  const range = value as { min?: unknown; max?: unknown; step?: unknown };
  const min = range.min ?? "-";
  const max = range.max ?? "-";
  const step = range.step ? `，步进 ${range.step}` : "";
  return `${min} 到 ${max}${unit ? ` ${unit}` : ""}${step}`;
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

export function normalizeFavorites(
  settings: SettingsDto,
): SettingsSaveInput["favorites"] {
  return (settings.favorites ?? []).map((favorite, index) => ({
    device_id: favorite.device_id,
    selected: favorite.selected ?? true,
    favorite_order:
      typeof favorite.favorite_order === "number"
        ? favorite.favorite_order
        : index,
  }));
}

export function getNextFavoriteOrder(favorites: SettingsSaveInput["favorites"]) {
  const orders = favorites
    .map((favorite, index) =>
      typeof favorite.favorite_order === "number"
        ? favorite.favorite_order
        : index,
    )
    .filter((order) => Number.isFinite(order));
  return orders.length ? Math.max(...orders) + 1 : 0;
}

export function buildSettingsSaveInput(
  settings: SettingsDto,
  favorites: SettingsSaveInput["favorites"],
): SettingsSaveInput {
  const pageSettings = settings.page_settings;
  const functionSettings = settings.function_settings;

  return {
    settings_version: settings.settings_version ?? null,
    page_settings: {
      room_label_mode: pageSettings?.room_label_mode ?? "ROOM_NAME",
      homepage_display_policy: pageSettings?.homepage_display_policy ?? {},
      icon_policy: pageSettings?.icon_policy ?? {},
      layout_preference: pageSettings?.layout_preference ?? {},
    },
    function_settings: {
      low_battery_threshold: functionSettings?.low_battery_threshold ?? 20,
      offline_threshold_seconds:
        functionSettings?.offline_threshold_seconds ?? 300,
      quick_entry_policy: functionSettings?.quick_entry_policy ?? {
        favorites: true,
      },
      music_enabled: functionSettings?.music_enabled ?? true,
      favorite_limit: functionSettings?.favorite_limit ?? 8,
      auto_home_timeout_seconds:
        functionSettings?.auto_home_timeout_seconds ?? 30,
      position_device_thresholds:
        functionSettings?.position_device_thresholds ?? {},
    },
    favorites,
  };
}

export function buildNextFavorites(
  settings: SettingsDto,
  deviceId: string,
  action: HomeEntryAction,
) {
  const favorites = normalizeFavorites(settings).filter(
    (favorite) => favorite.device_id !== deviceId,
  );

  if (action === "remove") {
    return favorites;
  }

  return [
    ...favorites,
    {
      device_id: deviceId,
      selected: true,
      favorite_order: getNextFavoriteOrder(favorites),
    },
  ];
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

export function buildCatalogStats(
  devices: DeviceListItemDto[],
): DeviceCatalogStats {
  const onlineCount = devices.filter((device) => !device.is_offline).length;
  const offlineCount = devices.length - onlineCount;
  const readonlyCount = devices.filter(
    (device) => device.is_readonly_device,
  ).length;
  const homeEntryCount = devices.filter((device) => device.is_favorite).length;
  return {
    onlineCount,
    offlineCount,
    readonlyCount,
    homeEntryCount,
  };
}
