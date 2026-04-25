import { DeviceListItemDto } from "../../api/types";
import { HomeViewModel } from "../../view-models/home";

export interface HomeMediaSource {
  key: string;
  source: string;
  title: string;
  subtitle: string;
  state: string;
  glyph: string;
  isPlaceholder?: boolean;
}

export function normalizeKeyword(value: string | null | undefined) {
  return (value ?? "").toLowerCase();
}

export function isLightDevice(device: DeviceListItemDto) {
  const source = normalizeKeyword(device.device_type);
  return source.includes("light") || source.includes("lamp") || source.includes("switch");
}

export function isClimateDevice(device: DeviceListItemDto) {
  const source = normalizeKeyword(device.device_type);
  return source.includes("climate") || source.includes("air") || source.includes("fridge");
}

export function isMediaDevice(device: DeviceListItemDto) {
  const source = normalizeKeyword(device.device_type);
  return source.includes("media") || source.includes("speaker") || source.includes("tv");
}

export function parsePercent(value: string) {
  const parsed = Number.parseFloat(value.replace("%", ""));
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.min(100, parsed));
}

export function parseNumber(value: string, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function weatherGlyph(condition: string) {
  const normalized = normalizeKeyword(condition);
  if (normalized.includes("雨") || normalized.includes("rain")) {
    return "☔";
  }
  if (normalized.includes("云") || normalized.includes("cloud")) {
    return "☁";
  }
  if (normalized.includes("雪") || normalized.includes("snow")) {
    return "❄";
  }
  if (normalized.includes("雷")) {
    return "⚡";
  }
  if (normalized.includes("雾")) {
    return "〰";
  }
  return "☀";
}

export function compactDateLabel(dateLabel: string) {
  const match = dateLabel.match(/(\d+)月(\d+)日/);
  if (!match) {
    return dateLabel;
  }
  return `${match[1]}月${match[2]}日`;
}

export function nextIndex(current: number, length: number, direction: -1 | 1) {
  if (length <= 1) {
    return current;
  }
  return (current + direction + length) % length;
}

export function buildInsightCounts(viewModel: HomeViewModel, devices: DeviceListItemDto[]) {
  return {
    lights:
      devices.filter((device) => !device.is_offline && isLightDevice(device)).length ||
      viewModel.summary.lightsOnCount,
    climate: devices.filter((device) => isClimateDevice(device)).length,
    battery: viewModel.summary.lowBatteryCount,
    offline:
      devices.filter((device) => device.is_offline).length || viewModel.summary.offlineCount,
  };
}

export function buildMediaSources(viewModel: HomeViewModel, devices: DeviceListItemDto[]) {
  const sources: HomeMediaSource[] = [];

  if (viewModel.media.deviceId || viewModel.media.bindingStatus !== "未配置") {
    sources.push({
      key: viewModel.media.deviceId ?? "default-media",
      source: viewModel.media.displayName,
      title: viewModel.media.trackTitle,
      subtitle: viewModel.media.artist,
      state: viewModel.media.playState,
      glyph: "♪",
    });
  }

  devices.filter(isMediaDevice).forEach((device, index) => {
    if (device.device_id === viewModel.media.deviceId) {
      return;
    }

    sources.push({
      key: device.device_id,
      source: device.display_name,
      title: device.room_name ? `${device.room_name} 播放设备` : "媒体播放设备",
      subtitle: device.is_offline ? "离线" : "可用",
      state: device.status,
      glyph: index % 2 === 0 ? "▶" : "H",
    });
  });

  if (!sources.length) {
    sources.push({
      key: "empty-media",
      source: "默认媒体",
      title: "未配置播放设备",
      subtitle: "到设置页选择默认播放器",
      state: "待机",
      glyph: "♪",
      isPlaceholder: true,
    });
  }

  return sources;
}
