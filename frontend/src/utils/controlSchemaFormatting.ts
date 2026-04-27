import type { DeviceControlSchemaItemDto } from "../api/types";

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
    return compactJsonValue(value);
  }
  const range = value as { min?: unknown; max?: unknown; step?: unknown };
  const min = range.min ?? "-";
  const max = range.max ?? "-";
  const step = range.step ? `，步进 ${range.step}` : "";
  return `${min} 到 ${max}${unit ? ` ${unit}` : ""}${step}`;
}

function compactJsonValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value, null, 2);
}
