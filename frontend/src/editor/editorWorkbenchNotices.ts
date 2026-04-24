export type EditorNoticeAction =
  | "refresh"
  | "retry-save"
  | "retry-publish"
  | "retry-acquire"
  | "retry-takeover"
  | "retry-discard"
  | "acquire"
  | "takeover";

export interface EditorNoticeState {
  tone: "success" | "warning" | "error";
  title: string;
  detail: string;
  actions?: EditorNoticeAction[];
}

export type EditorActionKind =
  | "save"
  | "publish"
  | "acquire"
  | "takeover"
  | "discard"
  | "upload";

function getEditorActionLabel(action: EditorActionKind) {
  switch (action) {
    case "save":
      return "保存草稿";
    case "publish":
      return "发布草稿";
    case "acquire":
      return "申请编辑";
    case "takeover":
      return "接管编辑";
    case "discard":
      return "丢弃草稿";
    case "upload":
      return "上传背景图";
  }
}

function getEditorRetryAction(action: EditorActionKind): EditorNoticeAction {
  switch (action) {
    case "save":
      return "retry-save";
    case "publish":
      return "retry-publish";
    case "acquire":
      return "retry-acquire";
    case "takeover":
      return "retry-takeover";
    case "discard":
      return "retry-discard";
    case "upload":
      return "retry-save";
  }
}

function formatInvalidFieldList(details: Record<string, unknown> | undefined) {
  const fields = details?.fields;
  if (!Array.isArray(fields)) {
    return null;
  }
  const labels = fields
    .map((field) => {
      if (!field || typeof field !== "object") {
        return null;
      }
      const value = (field as { field?: unknown }).field;
      return typeof value === "string" && value.length ? translateEditorFieldPath(value) : null;
    })
    .filter((value): value is string => Boolean(value))
    .slice(0, 3);
  return labels.length ? labels.join("、") : null;
}

export function asDetailRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function asDetailString(value: unknown) {
  return typeof value === "string" && value.length ? value : null;
}

function translateEditorFieldPath(field: string) {
  const normalized = field
    .replace(/^body\./, "")
    .replace(/^data\./, "")
    .replace(/^query\./, "");
  const parts = normalized.split(".");
  const hotspotIndex = parts.findIndex((part) => part === "hotspots");
  if (hotspotIndex >= 0) {
    const index = Number(parts[hotspotIndex + 1]);
    const target = parts[hotspotIndex + 2] ?? "";
    const label =
      target === "x"
        ? "横向位置"
        : target === "y"
          ? "纵向位置"
          : target === "device_id"
            ? "设备 ID"
            : target === "hotspot_id"
              ? "热点 ID"
              : target === "structure_order"
                ? "排序"
                : "字段";
    return Number.isFinite(index) ? `第 ${index + 1} 个热点的${label}` : `热点列表的${label}`;
  }

  const fieldLabels: Record<string, string> = {
    lease_id: "编辑租约",
    draft_version: "草稿版本",
    base_layout_version: "基线布局版本",
    background_asset_id: "背景资源",
    layout_meta: "布局元数据",
    home_id: "家庭 ID",
    terminal_id: "终端 ID",
    member_id: "成员 ID",
  };
  return fieldLabels[normalized] ?? normalized;
}

export function formatVersionConflictDetail(
  details: Record<string, unknown> | undefined,
  action: EditorActionKind,
) {
  const submitted = asDetailRecord(details?.submitted);
  const current = asDetailRecord(details?.current);
  const submittedDraftVersion = asDetailString(submitted?.draft_version);
  const currentDraftVersion = asDetailString(current?.draft_version);
  const submittedBaseVersion = asDetailString(submitted?.base_layout_version);
  const currentBaseVersion = asDetailString(current?.base_layout_version);

  const versionParts = [
    currentDraftVersion && submittedDraftVersion
      ? `当前草稿版本为 ${currentDraftVersion}，本次提交基于 ${submittedDraftVersion}`
      : null,
    currentBaseVersion && submittedBaseVersion && currentBaseVersion !== submittedBaseVersion
      ? `当前基线布局为 ${currentBaseVersion}，本次提交基于 ${submittedBaseVersion}`
      : null,
  ].filter(Boolean);

  const prefix = action === "publish" ? "发布前草稿已经变化" : "保存前草稿已经变化";
  return versionParts.length
    ? `${prefix}：${versionParts.join("；")}。页面已刷新到最新草稿，请确认后重试。`
    : `${prefix}。页面已刷新到最新草稿，请确认后重试。`;
}

export function formatLockLostDetail(details: Record<string, unknown> | undefined) {
  const reason = asDetailString(details?.reason);
  const activeLease = asDetailRecord(details?.active_lease);
  const activeTerminalId = asDetailString(activeLease?.terminal_id);
  const leaseExpiresAt = asDetailString(activeLease?.lease_expires_at);

  switch (reason) {
    case "LEASE_NOT_FOUND":
      return "当前编辑租约已经不存在，页面已刷新为只读草稿。请重新申请编辑后再继续。";
    case "LEASE_INACTIVE":
      return "当前编辑租约已经释放，页面已刷新为只读草稿。请重新申请编辑后再继续。";
    case "TERMINAL_MISMATCH":
      return activeTerminalId
        ? `当前编辑锁属于终端 ${activeTerminalId}，本终端不能继续写入。请确认后接管当前锁。`
        : "当前编辑锁属于其他终端，本终端不能继续写入。请确认后接管当前锁。";
    case "LEASE_EXPIRED":
      return leaseExpiresAt
        ? `当前编辑租约已在 ${leaseExpiresAt} 过期，页面已刷新为只读草稿。请重新申请编辑后再继续。`
        : "当前编辑租约已过期，页面已刷新为只读草稿。请重新申请编辑后再继续。";
    case "DRAFT_MISSING":
      return "后端草稿上下文已经不存在，页面已刷新为只读状态。请重新申请编辑后再继续。";
    default:
      return "当前会话已经失去编辑锁。请先刷新草稿，再重新申请编辑或接管其他终端的锁。";
  }
}

export function buildEditorErrorNotice(
  apiError: { code: string; message: string; details?: Record<string, unknown> },
  action: EditorActionKind,
): EditorNoticeState {
  const actionLabel = getEditorActionLabel(action);
  const retryAction = getEditorRetryAction(action);
  const invalidFields = formatInvalidFieldList(apiError.details);

  switch (apiError.code) {
    case "PIN_REQUIRED":
      return {
        tone: "warning",
        title: `${actionLabel}前需要管理 PIN`,
        detail: "当前管理 PIN 会话不可用，请先重新验证管理 PIN，再继续操作。",
        actions: ["refresh"],
      };
    case "PIN_LOCKED":
      return {
        tone: "error",
        title: "管理 PIN 已被锁定",
        detail: "当前 PIN 处于临时锁定状态，需等待锁定结束后再继续编辑操作。",
        actions: ["refresh"],
      };
    case "UNAUTHORIZED":
      return {
        tone: "error",
        title: "登录状态已失效",
        detail: "当前会话已失效，请刷新页面并重新进入编辑器。",
        actions: ["refresh"],
      };
    case "NETWORK_ERROR":
      return {
        tone: "error",
        title: `${actionLabel}时网络中断`,
        detail: "未能连接到服务端。请检查本机网络或容器状态后重试。",
        actions: ["refresh", retryAction],
      };
    case "HA_UNAVAILABLE":
      return {
        tone: "error",
        title: `${actionLabel}时服务依赖不可用`,
        detail: "当前 Home Assistant 或后端依赖未就绪，请稍后再试。",
        actions: ["refresh", retryAction],
      };
    case "BAD_RESPONSE":
      return {
        tone: "error",
        title: "服务端返回了无法解析的响应",
        detail: "本次操作没有拿到有效结果，请刷新草稿后重试。",
        actions: ["refresh", retryAction],
      };
    case "INTERNAL_SERVER_ERROR":
      return {
        tone: "error",
        title: `${actionLabel}时服务端异常`,
        detail: "服务端处理本次请求时发生异常，请稍后重试；若持续出现，需要查看后端日志。",
        actions: ["refresh", retryAction],
      };
    case "INVALID_PARAMS":
      return {
        tone: "error",
        title: action === "publish" ? "发布请求不完整" : `${actionLabel}参数不合法`,
        detail: invalidFields
          ? `请求字段校验未通过：${invalidFields}。请刷新草稿确认当前状态后再试。`
          : "当前提交内容未通过校验，请刷新草稿确认当前状态后再试。",
        actions: ["refresh", retryAction],
      };
    case "REQUEST_FAILED":
      return {
        tone: "error",
        title: `${actionLabel}失败`,
        detail: "请求没有成功完成，请刷新草稿后再试。",
        actions: ["refresh", retryAction],
      };
    default:
      return {
        tone: "error",
        title: `${actionLabel}失败`,
        detail: apiError.message,
        actions: ["refresh", retryAction],
      };
  }
}
