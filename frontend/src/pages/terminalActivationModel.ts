import { normalizeApiError } from "../api/httpClient";
import { TerminalPairingPollDto } from "../api/types";

export type TerminalActivationEntryMode = "scan" | "code" | "pairing";

export interface TerminalActivationSuccessState {
  destinationLabel: string;
  mode: TerminalActivationEntryMode;
}

export const PAIRING_POLL_INTERVAL_MS = 3000;
export const PAIRING_REFRESH_COOLDOWN_SECONDS = 30;

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

export function formatRemainingDuration(totalSeconds: number | null) {
  if (totalSeconds === null) {
    return "-";
  }
  if (totalSeconds <= 0) {
    return "已到期";
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}小时 ${remainingMinutes}分`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function secondsUntil(value: string | null | undefined, nowMs: number) {
  if (!value) {
    return null;
  }
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return null;
  }
  return Math.max(0, Math.ceil((timestamp - nowMs) / 1000));
}

export function statusTone(status: TerminalPairingPollDto["status"]) {
  switch (status) {
    case "CLAIMED":
    case "DELIVERED":
    case "COMPLETED":
      return "success";
    case "EXPIRED":
    case "INVALIDATED":
      return "warning";
    default:
      return "waiting";
  }
}

export function pairingStatusSummary(status: TerminalPairingPollDto["status"]) {
  switch (status) {
    case "CLAIMED":
      return {
        detail: "管理端已认领，正在把激活凭证安全下发到这台终端。",
        hint: "已认领",
        label: "已认领",
      };
    case "DELIVERED":
      return {
        detail: "激活凭证已送达，终端正在完成登录。",
        hint: "已激活",
        label: "已激活",
      };
    case "COMPLETED":
      return {
        detail: "这台终端已经完成激活。如果页面没有自动进入首页，请重新生成绑定码。",
        hint: "已激活",
        label: "已激活",
      };
    case "EXPIRED":
      return {
        detail: "这次绑定码已经过期，请刷新生成新的绑定码。",
        hint: "已过期",
        label: "已过期",
      };
    case "INVALIDATED":
      return {
        detail: "旧绑定码已被新的绑定码替换，请以最新绑定码为准。",
        hint: "已过期",
        label: "已过期",
      };
    default:
      return {
        detail: "绑定码已经发出，正在等待管理端认领。",
        hint: "待认领",
        label: "已发码",
      };
  }
}

export function pairingIssueErrorCopy(error: unknown) {
  const payload = normalizeApiError(error);
  const retryAfter = payload.details?.retry_after_seconds;
  if (payload.details?.reason === "cooldown") {
    if (typeof retryAfter === "number" && retryAfter > 0) {
      return `绑定码刚刚刷新过，请在 ${retryAfter} 秒后再试。`;
    }
    return "绑定码刚刚刷新过，请稍后再试。";
  }
  if (payload.code === "NOT_FOUND") {
    return "这台终端还没有登记到交付清单，暂时无法生成绑定码。";
  }
  return payload.message;
}

export function pairingPollErrorCopy(error: unknown) {
  const payload = normalizeApiError(error);
  if (payload.code === "NOT_FOUND") {
    return "这次绑定流程已经失效，请刷新生成新的绑定码。";
  }
  return payload.message;
}

export function activationInputError(mode: TerminalActivationEntryMode) {
  if (mode === "scan") {
    return "没有识别到可用的激活链接，请重新扫码或粘贴完整链接。";
  }
  return "没有识别到可用的激活码，请检查内容是否完整。";
}

export function entryTitle(mode: TerminalActivationEntryMode) {
  switch (mode) {
    case "scan":
      return "扫码激活";
    case "code":
      return "输入激活码";
    default:
      return "等待绑定码认领";
  }
}

export function completionCopy(mode: TerminalActivationEntryMode) {
  switch (mode) {
    case "scan":
      return {
        detail: "二维码内容已验证通过，终端会直接进入首页。",
        title: "扫码激活完成",
      };
    case "code":
      return {
        detail: "恢复凭证已验证通过，终端会直接进入首页。",
        title: "恢复激活完成",
      };
    default:
      return {
        detail: "管理端认领已经完成，终端会直接进入首页。",
        title: "新装终端已激活",
      };
  }
}

type StatusStageState = "done" | "current" | "upcoming" | "warning";

export function buildPairingStages(status: TerminalPairingPollDto["status"]) {
  const states: Record<string, StatusStageState> = {
    claimed: "upcoming",
    delivered: "upcoming",
    expired: "upcoming",
    issued: "current",
    pending: "upcoming",
  };

  switch (status) {
    case "CLAIMED":
      states.issued = "done";
      states.pending = "done";
      states.claimed = "current";
      break;
    case "DELIVERED":
    case "COMPLETED":
      states.issued = "done";
      states.pending = "done";
      states.claimed = "done";
      states.delivered = "current";
      break;
    case "EXPIRED":
    case "INVALIDATED":
      states.issued = "done";
      states.pending = "done";
      states.expired = "warning";
      break;
    default:
      states.pending = "current";
      break;
  }

  return [
    { label: "已发码", state: states.issued },
    { label: "待认领", state: states.pending },
    { label: "已认领", state: states.claimed },
    { label: "已激活", state: states.delivered },
    { label: "已过期", state: states.expired },
  ];
}
