import { acceptDeviceControl, fetchDeviceControlResult } from "../../api/deviceControlsApi";
import { normalizeApiError } from "../../api/httpClient";
import { DeviceControlResultDto, DeviceControlSchemaItemDto } from "../../api/types";

export function normalizeControlKeyword(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

export function controlSchemaKey(schema: DeviceControlSchemaItemDto, index: number) {
  return `${schema.action_type}:${schema.target_scope ?? ""}:${schema.target_key ?? ""}:${index}`;
}

export function makeDeviceControlRequestId(prefix: string, deviceId: string) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${deviceId}-${suffix}`;
}

export function isPowerControlSchema(schema: DeviceControlSchemaItemDto) {
  const type = schema.value_type?.toUpperCase() ?? "NONE";
  const source = normalizeControlKeyword(
    `${schema.action_type} ${schema.target_scope ?? ""} ${schema.target_key ?? ""}`,
  );
  return type.includes("BOOL") || source.includes("power") || source.includes("toggle");
}

export function isRuntimePowerOn(value: unknown, offline?: boolean) {
  if (offline) {
    return false;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = normalizeControlKeyword(typeof value === "string" ? value : "");
  return (
    normalized.includes("on") ||
    normalized.includes("open") ||
    normalized.includes("active") ||
    normalized.includes("running") ||
    normalized.includes("playing")
  );
}

export function nextPowerValueFromState(value: unknown, offline?: boolean) {
  if (offline) {
    return true;
  }
  const normalized = normalizeControlKeyword(typeof value === "string" ? value : "");
  if (!normalized) {
    return true;
  }
  if (
    normalized.includes("off") ||
    normalized.includes("closed") ||
    normalized.includes("inactive") ||
    normalized.includes("idle") ||
    normalized.includes("paused")
  ) {
    return true;
  }
  return !isRuntimePowerOn(value, offline);
}

export function formatPowerStateLabel(value: unknown, offline?: boolean) {
  if (offline) {
    return "OFFLINE";
  }
  const normalized = normalizeControlKeyword(typeof value === "string" ? value : "");
  if (isRuntimePowerOn(value, offline)) {
    return "ON";
  }
  if (
    normalized.includes("off") ||
    normalized.includes("closed") ||
    normalized.includes("inactive") ||
    normalized.includes("idle") ||
    normalized.includes("paused")
  ) {
    return "OFF";
  }
  return typeof value === "string" && value.trim() ? value : "WAIT";
}

export function normalizeControlPayloadValue(
  schema: DeviceControlSchemaItemDto,
  value: unknown,
) {
  const type = schema.value_type?.toUpperCase() ?? "NONE";
  if (type === "NONE") {
    return null;
  }
  if (isPowerControlSchema(schema)) {
    return Boolean(value);
  }
  return value;
}

export function formatDeviceControlError(error: unknown) {
  const apiError = normalizeApiError(error);
  switch (apiError.code) {
    case "INVALID_PARAMS":
      return "控制参数不符合设备要求";
    case "VALUE_OUT_OF_RANGE":
      return "控制值超出设备允许范围";
    case "UNSUPPORTED_ACTION":
      return "设备不支持这个控制动作";
    case "UNSUPPORTED_TARGET":
      return "设备不支持这个控制目标";
    case "DEVICE_NOT_FOUND":
      return "设备不存在或已被移除";
    case "NETWORK_ERROR":
      return "控制请求没有到达服务端";
    case "UNAUTHORIZED":
      return "登录状态已失效";
    default:
      return apiError.message;
  }
}

interface SubmitDeviceControlOptions {
  deviceId: string;
  schema: DeviceControlSchemaItemDto;
  value: unknown;
  requestPrefix: string;
  pollAttempts?: number;
}

export async function submitDeviceControl({
  deviceId,
  schema,
  value,
  requestPrefix,
  pollAttempts = 5,
}: SubmitDeviceControlOptions): Promise<DeviceControlResultDto | null> {
  const accepted = await acceptDeviceControl({
    request_id: makeDeviceControlRequestId(requestPrefix, deviceId),
    device_id: deviceId,
    action_type: schema.action_type,
    payload: {
      target_scope: schema.target_scope,
      target_key: schema.target_key,
      value: normalizeControlPayloadValue(schema, value),
      unit: schema.unit,
    },
    client_ts: new Date().toISOString(),
  });

  for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, attempt === 0 ? 320 : 580));
    const result = await fetchDeviceControlResult(accepted.request_id);
    if (result.execution_status !== "PENDING") {
      return result;
    }
  }

  return null;
}
