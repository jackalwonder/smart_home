import { asNumber, asOptionalString, asRecord } from "./utils";
import { type ImageSize } from "../types/image";

export function normalizeKeyword(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

export function formatNumber(value: unknown, fallback = "--") {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return fallback;
}

export function formatMetricValue(value: unknown, unit: string, fallback = "--") {
  const normalized = formatNumber(value, fallback);
  return normalized === fallback ? fallback : `${normalized} ${unit}`.trim();
}

export function parseImageSize(value: unknown): ImageSize | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const width = asNumber(record.width, 0);
  const height = asNumber(record.height, 0);
  if (width <= 0 || height <= 0) {
    return null;
  }

  return { width, height };
}

export function formatEnergyUpdateLabel(value: string | null) {
  if (!value) {
    return "--";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const hour = String(parsed.getHours()).padStart(2, "0");
  const minute = String(parsed.getMinutes()).padStart(2, "0");
  return `${parsed.getMonth() + 1}月${parsed.getDate()}日 ${hour}.${minute}`;
}

export function extractStatusSummary(value: unknown) {
  const record = asRecord(value);
  return (
    asOptionalString(record?.primary) ??
    asOptionalString(record?.state) ??
    asOptionalString(record?.text) ??
    asOptionalString(value)
  );
}

export function translateWeatherCondition(value: string | null | undefined) {
  const normalized = normalizeKeyword(value);
  const code = Number(value);

  if (Number.isFinite(code)) {
    if (code === 0) {
      return "晴";
    }
    if ([1, 2].includes(code)) {
      return "晴间多云";
    }
    if (code === 3) {
      return "多云";
    }
    if ([45, 48].includes(code)) {
      return "雾";
    }
    if ([51, 53, 55, 56, 57].includes(code)) {
      return "毛毛雨";
    }
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
      return "降雨";
    }
    if ([71, 73, 75, 77, 85, 86].includes(code)) {
      return "降雪";
    }
    if ([95, 96, 99].includes(code)) {
      return "雷雨";
    }
  }

  const map: Record<string, string> = {
    sunny: "晴",
    clear: "晴",
    partlycloudy: "晴间多云",
    cloudy: "多云",
    partly_cloudy: "多云",
    rainy: "降雨",
    rain: "降雨",
    thunderstorm: "雷雨",
    windy: "有风",
    fog: "雾",
    haze: "轻雾",
    snowy: "降雪",
  };

  return map[normalized] ?? (value?.trim() || "天气待更新");
}

export function weatherIcon(condition: string) {
  const normalized = normalizeKeyword(condition);
  const code = Number(condition);

  if (Number.isFinite(code)) {
    if ([1, 2, 3, 45, 48].includes(code)) {
      return "☁";
    }
    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code)) {
      return "☔";
    }
    if ([71, 73, 75, 77, 85, 86].includes(code)) {
      return "❄";
    }
    return "☀";
  }

  if (normalized.includes("cloud") || normalized.includes("云")) {
    return "☁";
  }
  if (normalized.includes("rain") || normalized.includes("雨")) {
    return "☔";
  }
  if (normalized.includes("snow") || normalized.includes("雪")) {
    return "❄";
  }
  if (normalized.includes("wind")) {
    return "≈";
  }
  return "☀";
}

export function deriveHotspotGlyph(deviceType: string, iconType: string): string {
  const source = `${deviceType} ${iconType}`.toLowerCase();
  if (source.includes("light") || source.includes("lamp")) {
    return "灯";
  }
  if (source.includes("fan")) {
    return "扇";
  }
  if (source.includes("climate") || source.includes("air")) {
    return "温";
  }
  if (source.includes("curtain") || source.includes("cover")) {
    return "帘";
  }
  if (source.includes("sensor")) {
    return "感";
  }
  if (source.includes("media") || source.includes("tv")) {
    return "影";
  }
  if (source.includes("fridge") || source.includes("kitchen")) {
    return "厨";
  }
  return "控";
}

export function deviceTypeToLabel(value: string) {
  const normalized = normalizeKeyword(value);
  if (normalized.includes("light") || normalized.includes("lamp")) {
    return "灯光";
  }
  if (normalized.includes("switch")) {
    return "开关";
  }
  if (normalized.includes("fan")) {
    return "风扇";
  }
  if (normalized.includes("climate") || normalized.includes("air")) {
    return "空调";
  }
  if (normalized.includes("cover") || normalized.includes("curtain")) {
    return "窗帘";
  }
  if (normalized.includes("sensor")) {
    return "传感器";
  }
  if (normalized.includes("media") || normalized.includes("tv")) {
    return "媒体";
  }
  if (normalized.includes("fridge")) {
    return "冰箱";
  }
  return "设备";
}

export function statusToLabel(status: string, isOffline: boolean) {
  if (isOffline) {
    return "离线";
  }

  const normalized = normalizeKeyword(status);
  if (
    normalized.includes("on") ||
    normalized.includes("open") ||
    normalized.includes("active")
  ) {
    return "已开启";
  }
  if (normalized.includes("running")) {
    return "运行中";
  }
  if (
    normalized.includes("off") ||
    normalized.includes("closed") ||
    normalized.includes("inactive")
  ) {
    return "已关闭";
  }
  if (normalized.includes("idle")) {
    return "待机";
  }
  if (normalized.includes("paused")) {
    return "暂停";
  }
  return status?.trim() || "状态未知";
}

export function entryBehaviorToLabel(value: string) {
  const normalized = normalizeKeyword(value);
  if (normalized.includes("toggle")) {
    return "快速切换";
  }
  if (
    normalized.includes("open_control_card") ||
    normalized.includes("control_card") ||
    normalized.includes("open_panel") ||
    normalized.includes("panel") ||
    normalized.includes("card")
  ) {
    return "打开面板";
  }
  if (normalized.includes("view")) {
    return "查看详情";
  }
  if (normalized.includes("direct")) {
    return "直接操作";
  }
  return value?.trim() || "进入控制";
}

export function deriveHotspotTone(
  deviceType: string,
  status: string,
  isOffline: boolean,
): "accent" | "warm" | "neutral" {
  if (isOffline) {
    return "neutral";
  }
  const normalizedStatus = normalizeKeyword(status);
  if (
    normalizedStatus.includes("on") ||
    normalizedStatus.includes("running") ||
    normalizedStatus.includes("open")
  ) {
    return "warm";
  }
  if (normalizeKeyword(deviceType).includes("sensor")) {
    return "accent";
  }
  return "accent";
}

export function translateServiceStatus(value: string | null | undefined) {
  const normalized = normalizeKeyword(value);
  const map: Record<string, string> = {
    media_unset: "未配置",
    unbound: "未绑定",
    bound: "已绑定",
    available: "可用",
    unavailable: "不可用",
    idle: "待机",
    playing: "播放中",
    paused: "已暂停",
    success: "已完成",
    pending: "待刷新",
  };
  return map[normalized] ?? (value?.trim() || "-");
}

export function isPolicyEnabled(
  value: Record<string, unknown> | null,
  key: string,
  fallback = true,
) {
  if (!value || !(key in value)) {
    return fallback;
  }
  const raw = value[key];
  if (typeof raw === "string") {
    return !["false", "0", "off", "disabled"].includes(raw.toLowerCase());
  }
  return raw !== false;
}

export function shouldShowFavoriteDevices(value: Record<string, unknown> | null) {
  const uiPolicy = asRecord(value?.ui_policy);
  const homepageDisplayPolicy = asRecord(uiPolicy?.homepage_display_policy);
  const quickEntries = asRecord(value?.quick_entries);
  return (
    isPolicyEnabled(homepageDisplayPolicy, "show_favorites") &&
    isPolicyEnabled(quickEntries, "favorites")
  );
}
