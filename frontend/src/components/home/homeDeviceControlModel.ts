import { normalizeApiError } from "../../api/httpClient";
import { DeviceControlResultDto, DeviceControlSchemaItemDto } from "../../api/types";
import { HomeHotspotViewModel } from "../../view-models/home";

export function makeRequestId(deviceId: string, prefix = "home-ui") {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${deviceId}-${suffix}`;
}

export function normalizeKeyword(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

export function schemaKey(schema: DeviceControlSchemaItemDto, index: number) {
  return `${schema.action_type}:${schema.target_scope ?? ""}:${schema.target_key ?? ""}:${index}`;
}

export function getRangeNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function isBooleanSchema(schema: DeviceControlSchemaItemDto) {
  const type = schema.value_type?.toUpperCase() ?? "NONE";
  return type.includes("BOOL") || normalizeKeyword(schema.action_type).includes("power");
}

export function isNumberSchema(schema: DeviceControlSchemaItemDto) {
  const type = schema.value_type?.toUpperCase() ?? "NONE";
  return (
    Boolean(schema.value_range) ||
    type.includes("NUMBER") ||
    type.includes("INT") ||
    type.includes("FLOAT")
  );
}

export function getInitialValue(schema: DeviceControlSchemaItemDto): unknown {
  const type = schema.value_type?.toUpperCase() ?? "NONE";
  if (type === "NONE") {
    return null;
  }
  if (Array.isArray(schema.allowed_values) && schema.allowed_values.length > 0) {
    return schema.allowed_values[0];
  }
  const min = getRangeNumber(schema.value_range?.min);
  if (min !== undefined) {
    return min;
  }
  if (isBooleanSchema(schema)) {
    return true;
  }
  return "";
}

export function normalizeControlValue(
  schema: DeviceControlSchemaItemDto,
  value: unknown,
): unknown {
  const type = schema.value_type?.toUpperCase() ?? "NONE";
  if (type === "NONE") {
    return null;
  }
  if (isBooleanSchema(schema)) {
    return Boolean(value);
  }
  if (isNumberSchema(schema)) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}

export function formatStatus(value: unknown, offline?: boolean) {
  if (offline) {
    return "离线";
  }
  const normalized = normalizeKeyword(typeof value === "string" ? value : "");
  if (normalized.includes("on") || normalized.includes("open")) {
    return "已开启";
  }
  if (normalized.includes("running")) {
    return "运行中";
  }
  if (normalized.includes("off") || normalized.includes("closed")) {
    return "已关闭";
  }
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  return "状态待更新";
}

export function formatOptionLabel(value: unknown) {
  const normalized = normalizeKeyword(String(value));
  const map: Record<string, string> = {
    auto: "自动",
    cool: "制冷",
    heat: "制热",
    dry: "除湿",
    fan: "送风",
    high: "高",
    medium: "中",
    mid: "中",
    low: "低",
    eco: "节能",
    sleep: "睡眠",
    on: "开启",
    off: "关闭",
    true: "开启",
    false: "关闭",
  };
  return map[normalized] ?? String(value);
}

export function describeAction(schema: DeviceControlSchemaItemDto) {
  const source = normalizeKeyword(
    `${schema.action_type} ${schema.target_scope ?? ""} ${schema.target_key ?? ""}`,
  );
  if (source.includes("brightness")) {
    return { title: "亮度", valueLabel: "亮度", submitText: "应用亮度" };
  }
  if (source.includes("temperature") || source.includes("temp")) {
    return { title: "温度", valueLabel: "目标温度", submitText: "应用温度" };
  }
  if (source.includes("mode")) {
    return { title: "模式", valueLabel: "模式", submitText: "切换模式" };
  }
  if (source.includes("fan_speed") || source.includes("speed")) {
    return { title: "风速", valueLabel: "风速", submitText: "应用风速" };
  }
  if (source.includes("position") || source.includes("cover")) {
    return { title: "开合位置", valueLabel: "位置", submitText: "应用位置" };
  }
  if (source.includes("scene") || source.includes("trigger") || source.includes("execute")) {
    return { title: "执行动作", valueLabel: "动作", submitText: "立即执行" };
  }
  if (source.includes("power") || source.includes("toggle")) {
    return { title: "电源开关", valueLabel: "开关状态", submitText: "发送开关" };
  }
  return { title: "设备控制", valueLabel: "控制值", submitText: "发送控制" };
}

export function formatControlError(error: unknown) {
  const apiError = normalizeApiError(error);
  switch (apiError.code) {
    case "INVALID_PARAMS":
      return "控制参数不符合设备要求，请调整后重试。";
    case "VALUE_OUT_OF_RANGE":
      return "控制值超出设备允许范围，请重新调整。";
    case "UNSUPPORTED_ACTION":
      return "当前设备不支持这个控制动作。";
    case "UNSUPPORTED_TARGET":
      return "当前设备不支持这个控制目标。";
    case "DEVICE_NOT_FOUND":
      return "设备不存在或已被移除，请刷新首页后重试。";
    case "NETWORK_ERROR":
      return "控制请求没有到达服务端，请检查网络与服务状态。";
    case "UNAUTHORIZED":
      return "登录状态已失效，请刷新页面后重新进入。";
    default:
      return apiError.message;
  }
}

export function describeResult(result: DeviceControlResultDto) {
  switch (result.execution_status) {
    case "SUCCESS":
      return "设备已完成控制";
    case "FAILED":
      return result.error_message ?? "设备没有完成这次控制";
    case "TIMEOUT":
      return "等待设备确认超时";
    case "STATE_MISMATCH":
      return "设备状态未达到预期";
    case "PENDING":
      return "正在等待设备确认";
    default:
      return result.execution_status;
  }
}

export function toneLabel(tone: HomeHotspotViewModel["tone"]) {
  switch (tone) {
    case "warm":
      return "is-warm";
    case "neutral":
      return "is-neutral";
    default:
      return "is-accent";
  }
}
