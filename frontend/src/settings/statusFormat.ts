export type SettingsStatusTone = "success" | "warning" | "danger" | "neutral";

export type SettingsStatusDomain =
  | "backup"
  | "connection"
  | "generic"
  | "media"
  | "sgcc"
  | "terminal";

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: "可用",
  BOUND: "已绑定",
  COMPLETED: "已完成",
  CONFIGURED: "已配置",
  CONNECTED: "已连接",
  DATA_READY: "国网数据已就绪",
  DEGRADED: "连接异常",
  DISCONNECTED: "未连接",
  ERROR: "错误",
  EXPIRED: "二维码已过期",
  FAILED: "失败",
  FETCHING_DATA: "正在拉取国网数据",
  INVALID: "无效",
  INVALIDATED: "已失效",
  LOGIN_RUNNING: "正在登录国网",
  MEDIA_UNSET: "未配置媒体",
  NOT_CONFIGURED: "未配置",
  PENDING: "处理中",
  QR_EXPIRED: "二维码已过期",
  QR_READY: "二维码可扫码",
  READY: "可用",
  SUCCESS: "成功",
  TIMEOUT: "超时",
  UNAVAILABLE: "不可用",
  UNBOUND: "未绑定",
  UNKNOWN: "状态未知",
  WAITING_FOR_QR_CODE: "等待二维码",
  WAITING_FOR_SCAN: "等待扫码确认",
};

const SUCCESS_VALUES = new Set([
  "AVAILABLE",
  "BOUND",
  "COMPLETED",
  "CONFIGURED",
  "CONNECTED",
  "DATA_READY",
  "READY",
  "SUCCESS",
]);

const WARNING_VALUES = new Set([
  "DEGRADED",
  "DISCONNECTED",
  "EXPIRED",
  "FETCHING_DATA",
  "LOGIN_RUNNING",
  "MEDIA_UNSET",
  "NOT_CONFIGURED",
  "PENDING",
  "QR_EXPIRED",
  "QR_READY",
  "UNBOUND",
  "UNAVAILABLE",
  "WAITING_FOR_QR_CODE",
  "WAITING_FOR_SCAN",
]);

const DANGER_VALUES = new Set(["ERROR", "FAILED", "INVALID", "INVALIDATED", "TIMEOUT"]);

function normalizeStatus(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "-") {
    return null;
  }
  return trimmed.toUpperCase();
}

export function formatSettingsStatus(
  value: string | null | undefined,
  domain: SettingsStatusDomain = "generic",
) {
  const normalized = normalizeStatus(value);
  if (!normalized) {
    return "未获取";
  }

  if (domain === "terminal" && normalized === "TOKEN_READY") {
    return "激活凭据已准备";
  }

  return STATUS_LABELS[normalized] ?? value ?? "状态未知";
}

export function getSettingsStatusTone(
  value: string | null | undefined,
  domain: SettingsStatusDomain = "generic",
): SettingsStatusTone {
  const normalized = normalizeStatus(value);
  if (!normalized || normalized === "UNKNOWN") {
    return "neutral";
  }

  if (domain === "terminal" && normalized === "TOKEN_READY") {
    return "success";
  }

  if (SUCCESS_VALUES.has(normalized)) {
    return "success";
  }
  if (WARNING_VALUES.has(normalized)) {
    return "warning";
  }
  if (DANGER_VALUES.has(normalized)) {
    return "danger";
  }
  return "neutral";
}
