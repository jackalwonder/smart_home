import { normalizeApiError } from "../../api/httpClient";
import {
  DeviceControlSchemaItemDto,
  DeviceDetailDto,
  DeviceListItemDto,
} from "../../api/types";

export type HomeClusterKey = "lights" | "climate" | "battery" | "offline";

export type FeedbackTone = "info" | "success" | "warning" | "error";

export function normalizeKeyword(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

export function schemaId(schema: DeviceControlSchemaItemDto, index: number) {
  return `${schema.action_type}:${schema.target_scope ?? ""}:${schema.target_key ?? ""}:${index}`;
}

export function makeRequestId(deviceId: string) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `cluster-${deviceId}-${suffix}`;
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

export function getInitialValue(schema: DeviceControlSchemaItemDto) {
  const type = (schema.value_type ?? "NONE").toUpperCase();
  if (Array.isArray(schema.allowed_values) && schema.allowed_values.length > 0) {
    return schema.allowed_values[0];
  }
  if (type.includes("BOOL") || normalizeKeyword(schema.action_type).includes("power")) {
    return true;
  }
  const min = rangeNumber(schema.value_range?.min);
  if (min !== undefined) {
    return min;
  }
  if (type === "NONE") {
    return null;
  }
  return "";
}

export function isPowerSchema(schema: DeviceControlSchemaItemDto) {
  const source = normalizeKeyword(
    `${schema.action_type} ${schema.target_scope ?? ""} ${schema.target_key ?? ""}`,
  );
  return source.includes("power") || source.includes("toggle");
}

export function isTemperatureSchema(schema: DeviceControlSchemaItemDto) {
  const source = normalizeKeyword(
    `${schema.action_type} ${schema.target_scope ?? ""} ${schema.target_key ?? ""}`,
  );
  return source.includes("temperature") || source.includes("temp");
}

export function isBrightnessSchema(schema: DeviceControlSchemaItemDto) {
  const source = normalizeKeyword(
    `${schema.action_type} ${schema.target_scope ?? ""} ${schema.target_key ?? ""}`,
  );
  return source.includes("brightness");
}

export function isModeSchema(schema: DeviceControlSchemaItemDto) {
  return normalizeKeyword(schema.action_type).includes("mode");
}

export function formatRuntimeState(detail: DeviceDetailDto | DeviceListItemDto) {
  const value =
    "runtime_state" in detail
      ? (detail.runtime_state?.aggregated_state ?? detail.status)
      : detail.status;
  const normalized = normalizeKeyword(typeof value === "string" ? value : "");
  if (detail.is_offline) {
    return "离线";
  }
  if (normalized.includes("on") || normalized.includes("open")) {
    return "已开启";
  }
  if (normalized.includes("running")) {
    return "运行中";
  }
  if (normalized.includes("off") || normalized.includes("closed")) {
    return "已关闭";
  }
  return typeof value === "string" && value.trim() ? value : "状态待更新";
}

export function formatOptionLabel(value: unknown) {
  const normalized = normalizeKeyword(String(value));
  const map: Record<string, string> = {
    auto: "自动",
    cool: "制冷",
    heat: "制热",
    dry: "除湿",
    fan: "送风",
    eco: "节能",
    sleep: "睡眠",
    high: "高",
    medium: "中",
    low: "低",
  };
  return map[normalized] ?? String(value);
}

export function clusterEyebrow(cluster: HomeClusterKey | null) {
  switch (cluster) {
    case "lights":
      return "常用灯光";
    case "climate":
      return "常用温控";
    case "battery":
      return "低电量";
    case "offline":
      return "离线设备";
    default:
      return "全屋控制";
  }
}

export function clusterIcon(cluster: HomeClusterKey | null) {
  switch (cluster) {
    case "lights":
      return "灯";
    case "climate":
      return "温";
    case "battery":
      return "电";
    case "offline":
      return "离";
    default:
      return "控";
  }
}

export function formatControlError(error: unknown) {
  const apiError = normalizeApiError(error);
  switch (apiError.code) {
    case "NETWORK_ERROR":
      return "控制请求没有成功到达服务端，请检查连接后重试。";
    case "UNAUTHORIZED":
      return "当前登录状态已失效，请刷新页面后再试。";
    case "INVALID_PARAMS":
      return "控制参数不符合设备要求，请调整后重试。";
    default:
      return apiError.message;
  }
}

export function modalTitle(cluster: HomeClusterKey | null) {
  switch (cluster) {
    case "lights":
      return "全屋灯光";
    case "climate":
      return "常用温控";
    case "battery":
      return "低电量设备";
    case "offline":
      return "离线设备";
    default:
      return "全屋控制";
  }
}

export function modalSubtitle(cluster: HomeClusterKey | null) {
  switch (cluster) {
    case "lights":
      return "常开的灯光可以在这里直接开关或调亮度。";
    case "climate":
      return "常用温控集中在这里，便于现场快速调节。";
    case "battery":
      return "优先排查需要更换电池的设备。";
    case "offline":
      return "检查离线设备的供电、网络与 HA 实体状态。";
    default:
      return "";
  }
}

export function feedbackTone(message: string | undefined): FeedbackTone {
  if (!message) {
    return "info";
  }
  const normalized = normalizeKeyword(message);
  if (
    normalized.includes("完成") ||
    normalized.includes("success") ||
    normalized.includes("已完成")
  ) {
    return "success";
  }
  if (
    normalized.includes("超时") ||
    normalized.includes("待确认") ||
    normalized.includes("尚未")
  ) {
    return "warning";
  }
  if (
    normalized.includes("失败") ||
    normalized.includes("错误") ||
    normalized.includes("invalid") ||
    normalized.includes("unsupported") ||
    normalized.includes("unauthorized")
  ) {
    return "error";
  }
  return "info";
}

export function filterClusterDevices(
  cluster: HomeClusterKey | null,
  devices: DeviceListItemDto[],
) {
  switch (cluster) {
    case "lights":
      return devices.filter((device) => {
        const source = normalizeKeyword(device.device_type);
        return (
          source.includes("light") || source.includes("lamp") || source.includes("switch")
        );
      });
    case "climate":
      return devices.filter((device) => {
        const source = normalizeKeyword(device.device_type);
        return (
          source.includes("climate") || source.includes("air") || source.includes("fridge")
        );
      });
    case "battery":
      return devices.filter((device) => (device.alert_badges ?? []).length > 0);
    case "offline":
      return devices.filter((device) => device.is_offline);
    default:
      return [];
  }
}
