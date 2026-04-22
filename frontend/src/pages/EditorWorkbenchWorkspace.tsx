import { useEffect, useRef, useState } from "react";
import { EditorCanvasWorkspace } from "../components/editor/EditorCanvasWorkspace";
import { EditorCommandBar } from "../components/editor/EditorCommandBar";
import { EditorInspector } from "../components/editor/EditorInspector";
import { EditorPublishSummary } from "../components/editor/EditorPublishSummary";
import { EditorRealtimeFeed } from "../components/editor/EditorRealtimeFeed";
import { EditorToolbox } from "../components/editor/EditorToolbox";
import {
  createEditorSession,
  discardEditorDraft,
  fetchEditorDraft,
  heartbeatEditorSession,
  previewEditorDraftDiff,
  publishEditorDraft,
  saveEditorDraft,
  takeoverEditorSession,
} from "../api/editorApi";
import { fetchDevices } from "../api/devicesApi";
import { normalizeApiError } from "../api/httpClient";
import { uploadFloorplanAsset, uploadHotspotIconAsset } from "../api/pageAssetsApi";
import { DeviceListItemDto, EditorDraftDiffDto } from "../api/types";
import { appStore, useAppStore } from "../store/useAppStore";
import { mapEditorViewModel } from "../view-models/editor";
import { EditorHotspotViewModel } from "../view-models/editor";
import { deriveHotspotIconKey } from "../utils/hotspotIcons";
import { WsEvent } from "../ws/types";
import { hasImageSize, type ImageSize } from "../types/image";

interface EditorDraftState {
  backgroundAssetId: string | null;
  backgroundImageUrl: string | null;
  backgroundImageSize: ImageSize | null;
  layoutMetaText: string;
  hotspots: EditorHotspotViewModel[];
}

type EditorHotspotField =
  | "label"
  | "deviceId"
  | "iconType"
  | "labelMode"
  | "x"
  | "y"
  | "structureOrder";

type EditorNoticeAction =
  | "refresh"
  | "retry-save"
  | "retry-publish"
  | "retry-acquire"
  | "retry-takeover"
  | "retry-discard"
  | "acquire"
  | "takeover";

interface EditorNoticeState {
  tone: "success" | "warning" | "error";
  title: string;
  detail: string;
  actions?: EditorNoticeAction[];
}

type EditorActionKind = "save" | "publish" | "acquire" | "takeover" | "discard" | "upload";
type EditorBulkAlignAction = "left" | "right" | "top" | "bottom" | "centerX" | "centerY";
type EditorBulkDistributeAction = "horizontal" | "vertical";

interface EditorPublishSummaryItem {
  label: string;
  value: string;
  count?: number;
}

interface EditorHistoryEntry {
  draft: EditorDraftState;
  selectedHotspotId: string | null;
  batchSelectedHotspotIds: string[];
  label: string;
}

interface EditorHistoryGroup {
  key: string;
  timer: number | null;
}

interface EditorSnapshotKey {
  leaseId: string | null;
  draftVersion: string | null;
  baseLayoutVersion: string | null;
  lockStatus: string | null;
}

type EditorDraftStateUpdater = (current: EditorDraftState) => EditorDraftState;

type DraftLockLostEvent = Extract<WsEvent, { event_type: "draft_lock_lost" }>;
type DraftTakenOverEvent = Extract<WsEvent, { event_type: "draft_taken_over" }>;
type VersionConflictDetectedEvent = Extract<WsEvent, { event_type: "version_conflict_detected" }>;

function isDraftLockLostEvent(event: WsEvent): event is DraftLockLostEvent {
  return event.event_type === "draft_lock_lost";
}

function isDraftTakenOverEvent(event: WsEvent): event is DraftTakenOverEvent {
  return event.event_type === "draft_taken_over";
}

function isVersionConflictDetectedEvent(event: WsEvent): event is VersionConflictDetectedEvent {
  return event.event_type === "version_conflict_detected";
}

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

function asDetailRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asDetailString(value: unknown) {
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

function formatVersionConflictDetail(
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

function formatLockLostDetail(details: Record<string, unknown> | undefined) {
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

function buildEditorErrorNotice(
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

function stringifyLayoutMeta(value: Record<string, unknown>) {
  return JSON.stringify(value ?? {}, null, 2);
}

function sortHotspots(hotspots: EditorHotspotViewModel[]) {
  return [...hotspots].sort((left, right) => left.structureOrder - right.structureOrder);
}

function resequenceHotspots(hotspots: EditorHotspotViewModel[]) {
  return sortHotspots(hotspots).map((hotspot, index) => ({
    ...hotspot,
    structureOrder: index,
  }));
}

function buildDeviceHotspotId(deviceId: string) {
  const normalized = deviceId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48);
  return `draft-device-${normalized}-${Date.now()}`;
}

function getNextHotspotPosition(index: number) {
  const column = index % 4;
  const row = Math.floor(index / 4);
  return {
    x: Math.min(0.2 + column * 0.2, 0.8),
    y: Math.min(0.25 + row * 0.16, 0.85),
  };
}

function buildLayoutMetaWithHotspotLabels(
  layoutMeta: Record<string, unknown>,
  hotspots: EditorHotspotViewModel[],
) {
  return {
    ...layoutMeta,
    hotspot_labels: Object.fromEntries(
      hotspots.map((hotspot) => [
        hotspot.id,
        hotspot.label.trim() || hotspot.deviceId.trim() || hotspot.id,
      ]),
    ),
  };
}

function clampPosition(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function normalizeImageSize(value: {
  width?: number | null;
  height?: number | null;
} | null | undefined): ImageSize | null {
  if (!value) {
    return null;
  }

  const normalized: ImageSize = {
    width: value.width ?? null,
    height: value.height ?? null,
  };
  return hasImageSize(normalized) ? normalized : null;
}

function isTextEditingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function cloneEditorDraftState(state: EditorDraftState): EditorDraftState {
  return {
    ...state,
    hotspots: state.hotspots.map((hotspot) => ({ ...hotspot })),
  };
}

function areEditorDraftStatesEqual(left: EditorDraftState, right: EditorDraftState) {
  if (
    left.backgroundAssetId !== right.backgroundAssetId ||
    left.backgroundImageUrl !== right.backgroundImageUrl ||
    left.layoutMetaText !== right.layoutMetaText ||
    left.hotspots.length !== right.hotspots.length
  ) {
    return false;
  }

  return left.hotspots.every((leftHotspot, index) => {
    const rightHotspot = right.hotspots[index];
    return (
      leftHotspot.id === rightHotspot.id &&
      leftHotspot.label === rightHotspot.label &&
      leftHotspot.deviceId === rightHotspot.deviceId &&
      leftHotspot.x === rightHotspot.x &&
      leftHotspot.y === rightHotspot.y &&
      leftHotspot.iconType === rightHotspot.iconType &&
      leftHotspot.iconAssetId === rightHotspot.iconAssetId &&
      leftHotspot.iconAssetUrl === rightHotspot.iconAssetUrl &&
      leftHotspot.labelMode === rightHotspot.labelMode &&
      leftHotspot.isVisible === rightHotspot.isVisible &&
      leftHotspot.structureOrder === rightHotspot.structureOrder
    );
  });
}

function parseLayoutMetaText(value: string) {
  const parsed = JSON.parse(value || "{}");
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function buildDraftHotspotInputs(hotspots: EditorHotspotViewModel[]) {
  return hotspots.map((hotspot, index) => ({
    hotspot_id: hotspot.id,
    device_id: hotspot.deviceId.trim(),
    x: hotspot.x,
    y: hotspot.y,
    icon_type: hotspot.iconType,
    icon_asset_id: hotspot.iconAssetId,
    label_mode: hotspot.labelMode,
    is_visible: hotspot.isVisible,
    structure_order: hotspot.structureOrder ?? index,
  }));
}

function buildDraftDiffInput(
  draftState: EditorDraftState,
  baseLayoutVersion: string | null,
) {
  const parsedLayoutMeta = parseLayoutMetaText(draftState.layoutMetaText);
  return {
    base_layout_version: baseLayoutVersion,
    background_asset_id: draftState.backgroundAssetId,
    layout_meta: buildLayoutMetaWithHotspotLabels(parsedLayoutMeta, draftState.hotspots),
    hotspots: buildDraftHotspotInputs(draftState.hotspots),
  };
}

function mapPublishSummary(diff: EditorDraftDiffDto): {
  items: EditorPublishSummaryItem[];
  totalChanges: number;
} {
  return {
    totalChanges: diff.total_changes ?? 0,
    items: (diff.items ?? []).map((item) => ({
      label: item.label ?? "-",
      value: item.summary ?? "-",
      count: item.count ?? undefined,
    })),
  };
}

function parseLayoutMetaTextSafe(value: string) {
  try {
    return parseLayoutMetaText(value);
  } catch {
    return {};
  }
}

function normalizeForComparison(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeForComparison);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== "hotspot_labels")
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalizeForComparison(item)]),
    );
  }
  return value;
}

function formatHotspotList(hotspots: EditorHotspotViewModel[]) {
  const names = hotspots.slice(0, 3).map((hotspot) => hotspot.label || hotspot.id);
  return hotspots.length > 3 ? `${names.join("、")} 等 ${hotspots.length} 个` : names.join("、");
}

function buildLocalPublishSummary(
  current: EditorDraftState,
  baseline: EditorDraftState | null,
): { items: EditorPublishSummaryItem[]; totalChanges: number } {
  if (!baseline) {
    return { items: [], totalChanges: 0 };
  }

  const currentById = new Map(current.hotspots.map((hotspot) => [hotspot.id, hotspot]));
  const baselineById = new Map(baseline.hotspots.map((hotspot) => [hotspot.id, hotspot]));
  const added = current.hotspots.filter((hotspot) => !baselineById.has(hotspot.id));
  const removed = baseline.hotspots.filter((hotspot) => !currentById.has(hotspot.id));
  const moved: EditorHotspotViewModel[] = [];
  const relabeled: EditorHotspotViewModel[] = [];
  const rebound: EditorHotspotViewModel[] = [];
  const restyled: EditorHotspotViewModel[] = [];
  const reordered: EditorHotspotViewModel[] = [];

  for (const hotspot of current.hotspots) {
    const previous = baselineById.get(hotspot.id);
    if (!previous) {
      continue;
    }
    if (Math.abs(hotspot.x - previous.x) > 0.0005 || Math.abs(hotspot.y - previous.y) > 0.0005) {
      moved.push(hotspot);
    }
    if (hotspot.label !== previous.label) {
      relabeled.push(hotspot);
    }
    if (hotspot.deviceId !== previous.deviceId) {
      rebound.push(hotspot);
    }
    if (
      hotspot.iconType !== previous.iconType ||
      hotspot.iconAssetId !== previous.iconAssetId ||
      hotspot.labelMode !== previous.labelMode ||
      hotspot.isVisible !== previous.isVisible
    ) {
      restyled.push(hotspot);
    }
    if (hotspot.structureOrder !== previous.structureOrder) {
      reordered.push(hotspot);
    }
  }

  const items: EditorPublishSummaryItem[] = [];
  const groups: Array<[string, EditorHotspotViewModel[]]> = [
    ["新增热点", added],
    ["移除热点", removed],
    ["位置调整", moved],
    ["名称更新", relabeled],
    ["设备绑定更新", rebound],
    ["展示样式更新", restyled],
    ["排序更新", reordered],
  ];
  let totalChanges = 0;
  for (const [label, hotspots] of groups) {
    if (!hotspots.length) {
      continue;
    }
    items.push({
      label,
      value: formatHotspotList(hotspots),
      count: hotspots.length,
    });
    totalChanges += hotspots.length;
  }

  if (current.backgroundAssetId !== baseline.backgroundAssetId) {
    items.push({
      label: "背景图更新",
      value: current.backgroundAssetId ? "已设置或替换背景图" : "已清除背景图",
      count: 1,
    });
    totalChanges += 1;
  }

  if (
    JSON.stringify(normalizeForComparison(parseLayoutMetaTextSafe(current.layoutMetaText))) !==
    JSON.stringify(normalizeForComparison(parseLayoutMetaTextSafe(baseline.layoutMetaText)))
  ) {
    items.push({
      label: "布局元数据更新",
      value: "JSON 元数据已修改",
      count: 1,
    });
    totalChanges += 1;
  }

  return { items, totalChanges };
}

interface EditorWorkbenchWorkspaceProps {
  embedded?: boolean;
}

export function EditorWorkbenchWorkspace({
  embedded = false,
}: EditorWorkbenchWorkspaceProps) {
  const session = useAppStore((state) => state.session);
  const editor = useAppStore((state) => state.editor);
  const pin = useAppStore((state) => state.pin);
  const events = useAppStore((state) => state.wsEvents);
  const terminalId = session.data?.terminalId;
  const pinSessionActive = session.data?.pinSessionActive ?? false;
  const [searchValue, setSearchValue] = useState("");
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null);
  const [batchSelectedHotspotIds, setBatchSelectedHotspotIds] = useState<string[]>([]);
  const [canvasMode, setCanvasMode] = useState<"edit" | "preview">("edit");
  const [draftState, setDraftState] = useState<EditorDraftState>({
    backgroundAssetId: null,
    backgroundImageUrl: null,
    backgroundImageSize: null,
    layoutMetaText: "{}",
    hotspots: [],
  });
  const [publishBaseline, setPublishBaseline] = useState<EditorDraftState | null>(null);
  const [publishSummary, setPublishSummary] = useState<{
    items: EditorPublishSummaryItem[];
    totalChanges: number;
  }>({ items: [], totalChanges: 0 });
  const [publishSummaryLoading, setPublishSummaryLoading] = useState(false);
  const [publishSummaryError, setPublishSummaryError] = useState<string | null>(null);
  const [deviceCatalog, setDeviceCatalog] = useState<DeviceListItemDto[]>([]);
  const [deviceCatalogLoading, setDeviceCatalogLoading] = useState(false);
  const [editorNotice, setEditorNotice] = useState<EditorNoticeState | null>(null);
  const handledRealtimeEventIdRef = useRef<string | null>(null);
  const publishBaselineLeaseIdRef = useRef<string | null>(null);
  const draftStateRef = useRef(draftState);
  const publishBaselineRef = useRef(publishBaseline);
  const appliedEditorSnapshotRef = useRef<EditorSnapshotKey | null>(null);
  const undoStackRef = useRef<EditorHistoryEntry[]>([]);
  const redoStackRef = useRef<EditorHistoryEntry[]>([]);
  const historyGroupRef = useRef<EditorHistoryGroup | null>(null);
  const [historyState, setHistoryState] = useState<{
    undoCount: number;
    redoCount: number;
    lastAction: string | null;
  }>({
    undoCount: 0,
    redoCount: 0,
    lastAction: null,
  });
  const [isAcquiringLock, setIsAcquiringLock] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isPublishingDraft, setIsPublishingDraft] = useState(false);
  const [isTakingOver, setIsTakingOver] = useState(false);
  const [isDiscardingDraft, setIsDiscardingDraft] = useState(false);
  const [isUploadingBackground, setIsUploadingBackground] = useState(false);
  const [isUploadingHotspotIcon, setIsUploadingHotspotIcon] = useState(false);

  function setLockConflictNotice(conflictTerminalId?: string | null) {
    appStore.clearEditorError();
    setEditorNotice({
      tone: "warning",
      title: "编辑租约已被其他终端占用",
      detail: conflictTerminalId
        ? `终端 ${conflictTerminalId} 当前持有编辑锁。你可以先刷新只读草稿，确认后再接管。`
        : "当前编辑锁已经转移到其他终端。你可以先刷新只读草稿，确认后再接管。",
      actions: ["refresh", "takeover"],
    });
  }

  function clearEditorFeedback() {
    appStore.clearEditorError();
    setEditorNotice(null);
  }

  function showEditorNotice(input: EditorNoticeState) {
    if (input.tone === "error") {
      appStore.setEditorError(input.detail);
    } else {
      appStore.clearEditorError();
    }
    setEditorNotice(input);
  }

  function applyEditorSession(input: {
    lock_status: string | null;
    lease_id?: string | null;
    lease_expires_at?: string | null;
    heartbeat_interval_seconds?: number | null;
    locked_by?: { terminal_id?: string | null } | null;
  }) {
    appStore.setEditorSession({
      lockStatus: input.lock_status,
      leaseId: input.lease_id ?? null,
      leaseExpiresAt: input.lease_expires_at ?? null,
      heartbeatIntervalSeconds: input.heartbeat_interval_seconds ?? null,
      lockedByTerminalId: input.locked_by?.terminal_id ?? null,
    });
  }

  function applyEditorDraft(input: Awaited<ReturnType<typeof fetchEditorDraft>>) {
    appStore.setEditorDraftData({
      draft: input.layout ?? null,
      draftVersion: input.draft_version,
      baseLayoutVersion: input.base_layout_version,
      readonly: input.readonly,
      lockStatus: input.lock_status,
    });
  }

  async function refreshDraft(leaseId?: string | null) {
    const refreshed = await fetchEditorDraft(leaseId);
    applyEditorDraft(refreshed);
    return refreshed;
  }

  async function openEditableSession(options?: { silent?: boolean }) {
    const lease = await createEditorSession();
    applyEditorSession(lease);
    const draft = await fetchEditorDraft(lease.lease_id);
    applyEditorDraft(draft);
    appStore.clearEditorError();

    if (lease.lock_status === "LOCKED_BY_OTHER") {
      setLockConflictNotice(lease.locked_by?.terminal_id);
    } else {
      setEditorNotice(null);
      if (!options?.silent) {
        showEditorNotice({
          tone: "success",
          title: "已获取编辑租约",
          detail: "当前终端已进入可编辑状态，可以继续修改当前草稿。",
        });
      }
    }

    return { lease, draft };
  }

  async function handleEditorActionError(
    error: unknown,
    action: EditorActionKind,
  ) {
    const apiError = normalizeApiError(error);

    if (apiError.code === "VERSION_CONFLICT") {
      try {
        await refreshDraft(editor.leaseId);
      } catch (refreshError) {
        showEditorNotice({
          tone: "error",
          title: "刷新草稿失败",
          detail: normalizeApiError(refreshError).message,
          actions: ["refresh"],
        });
        return;
      }
      appStore.setEditorSession({
        lockStatus: editor.lockStatus,
        leaseId: editor.leaseId,
      });
      showEditorNotice({
        tone: "warning",
        title: action === "publish" ? "发布前草稿版本已更新" : "保存前草稿版本已更新",
        detail: formatVersionConflictDetail(apiError.details, action),
        actions: [action === "publish" ? "retry-publish" : "retry-save"],
      });
      return;
    }

    if (apiError.code === "DRAFT_LOCK_LOST" || apiError.code === "DRAFT_LOCK_TAKEN_OVER") {
      const activeLease = asDetailRecord(apiError.details?.active_lease);
      const activeLeaseId = asDetailString(activeLease?.lease_id);
      const activeTerminalId = asDetailString(activeLease?.terminal_id);
      if (apiError.details?.reason === "TERMINAL_MISMATCH" && activeLeaseId && activeTerminalId) {
        appStore.setEditorSession({
          lockStatus: "LOCKED_BY_OTHER",
          leaseId: activeLeaseId,
          leaseExpiresAt: asDetailString(activeLease?.lease_expires_at),
          heartbeatIntervalSeconds: editor.heartbeatIntervalSeconds,
          lockedByTerminalId: activeTerminalId,
        });
      } else {
        appStore.setEditorSession({
          lockStatus: "READ_ONLY",
          leaseId: null,
          leaseExpiresAt: null,
          heartbeatIntervalSeconds: null,
          lockedByTerminalId: null,
        });
      }
      try {
        await refreshDraft();
      } catch (refreshError) {
        showEditorNotice({
          tone: "error",
          title: "刷新草稿失败",
          detail: normalizeApiError(refreshError).message,
          actions: ["refresh"],
        });
        return;
      }
      showEditorNotice({
        tone: "warning",
        title:
          action === "publish"
            ? "发布前失去编辑租约"
            : action === "save"
              ? "保存前失去编辑租约"
              : "编辑租约已失效",
        detail: formatLockLostDetail(apiError.details),
        actions: apiError.details?.reason === "TERMINAL_MISMATCH" ? ["refresh", "takeover"] : ["refresh", "acquire"],
      });
      return;
    }

    showEditorNotice(buildEditorErrorNotice(apiError, action));
  }

  useEffect(() => {
    if (!terminalId) {
      return;
    }

    let active = true;

    void (async () => {
      appStore.setEditorLoading();
      appStore.setEditorDraftLoading();

      try {
        if (pinSessionActive) {
          await openEditableSession({ silent: true });
          if (!active) {
            return;
          }
          return;
        }

        const draft = await fetchEditorDraft();
        if (!active) {
          return;
        }
        appStore.setEditorSession({
          lockStatus: draft.lock_status,
          leaseId: null,
          leaseExpiresAt: null,
          heartbeatIntervalSeconds: null,
          lockedByTerminalId: null,
        });
        applyEditorDraft(draft);
        clearEditorFeedback();
      } catch (error) {
        if (!active) {
          return;
        }
        await handleEditorActionError(error, "acquire");
      }
    })();

    return () => {
      active = false;
    };
  }, [pinSessionActive, terminalId]);

  useEffect(() => {
    let active = true;

    void (async () => {
      setDeviceCatalogLoading(true);
      try {
        const catalog = await fetchDevices({ page: 1, page_size: 200 });
        if (!active) {
          return;
        }
        setDeviceCatalog(catalog.items);
      } catch (error) {
        if (!active) {
          return;
        }
        appStore.setEditorError(normalizeApiError(error).message);
      } finally {
        if (active) {
          setDeviceCatalogLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      clearHistoryGroup();
    };
  }, []);

  useEffect(() => {
    draftStateRef.current = draftState;
  }, [draftState]);

  useEffect(() => {
    publishBaselineRef.current = publishBaseline;
  }, [publishBaseline]);

  const viewModel = mapEditorViewModel({
    lockStatus: editor.lockStatus,
    leaseId: editor.leaseId,
    leaseExpiresAt: editor.leaseExpiresAt,
    heartbeatIntervalSeconds: editor.heartbeatIntervalSeconds,
    lockedByTerminalId: editor.lockedByTerminalId,
    draft: editor.draft,
    draftVersion: editor.draftVersion,
    baseLayoutVersion: editor.baseLayoutVersion,
    readonly: editor.readonly,
    pinActive: pin.active,
    events,
  });

  useEffect(() => {
    const nextDraftState = {
      backgroundAssetId: viewModel.backgroundAssetId,
      backgroundImageUrl: viewModel.backgroundImageUrl,
      backgroundImageSize: viewModel.backgroundImageSize,
      layoutMetaText: stringifyLayoutMeta(viewModel.layoutMeta),
      hotspots: resequenceHotspots(viewModel.hotspots),
    };
    const snapshotKey: EditorSnapshotKey = {
      leaseId: editor.leaseId,
      draftVersion: editor.draftVersion,
      baseLayoutVersion: editor.baseLayoutVersion,
      lockStatus: editor.lockStatus,
    };
    const lastSnapshotKey = appliedEditorSnapshotRef.current;
    const isSameSnapshot =
      lastSnapshotKey?.leaseId === snapshotKey.leaseId &&
      lastSnapshotKey?.draftVersion === snapshotKey.draftVersion &&
      lastSnapshotKey?.baseLayoutVersion === snapshotKey.baseLayoutVersion &&
      lastSnapshotKey?.lockStatus === snapshotKey.lockStatus;
    const localBaseline = publishBaselineRef.current;
    const hasUnsavedLocalDraft =
      localBaseline !== null &&
      !areEditorDraftStatesEqual(draftStateRef.current, localBaseline);

    if (
      isSameSnapshot &&
      editor.lockStatus === "GRANTED" &&
      editor.leaseId &&
      hasUnsavedLocalDraft
    ) {
      return;
    }

    const nextHotspotIds = new Set(nextDraftState.hotspots.map((hotspot) => hotspot.id));
    setDraftState(nextDraftState);
    draftStateRef.current = nextDraftState;
    appliedEditorSnapshotRef.current = snapshotKey;
    clearHistoryGroup();
    undoStackRef.current = [];
    redoStackRef.current = [];
    syncHistoryState(null);
    setSelectedHotspotId((current) =>
      current && nextHotspotIds.has(current) ? current : viewModel.hotspots[0]?.id ?? null,
    );
    setBatchSelectedHotspotIds((current) =>
      current.filter((hotspotId) => nextHotspotIds.has(hotspotId)),
    );

    if (editor.lockStatus !== "GRANTED" || !editor.leaseId) {
      publishBaselineLeaseIdRef.current = editor.leaseId ?? null;
      publishBaselineRef.current = nextDraftState;
      setPublishBaseline(nextDraftState);
      return;
    }

    if (publishBaselineLeaseIdRef.current !== editor.leaseId) {
      publishBaselineLeaseIdRef.current = editor.leaseId;
      publishBaselineRef.current = nextDraftState;
      setPublishBaseline(nextDraftState);
      return;
    }

    setPublishBaseline((current) => current ?? nextDraftState);
  }, [
    editor.baseLayoutVersion,
    editor.draft,
    editor.draftVersion,
    editor.leaseId,
    editor.lockStatus,
  ]);

  useEffect(() => {
    let active = true;
    let timer = 0;

    timer = window.setTimeout(() => {
      void (async () => {
        try {
          const diffInput = buildDraftDiffInput(draftState, editor.baseLayoutVersion);
          if (!active) {
            return;
          }
          setPublishSummaryLoading(true);
          setPublishSummaryError(null);
          const diff = await previewEditorDraftDiff(diffInput);
          if (!active) {
            return;
          }
          setPublishSummary(mapPublishSummary(diff));
        } catch (error) {
          if (!active) {
            return;
          }
          setPublishSummary({ items: [], totalChanges: 0 });
          setPublishSummaryError(
            error instanceof SyntaxError
              ? "布局元数据暂时不可解析，发布前摘要不可用。"
              : "暂时无法读取后端发布摘要，请稍后重试。",
          );
        } finally {
          if (active) {
            setPublishSummaryLoading(false);
          }
        }
      })();
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [draftState, editor.baseLayoutVersion]);

  const visibleHotspots = sortHotspots(
    draftState.hotspots.filter((hotspot) =>
      `${hotspot.label} ${hotspot.deviceId}`.toLowerCase().includes(searchValue.trim().toLowerCase()),
    ),
  );
  const placedDeviceIds = new Set(
    draftState.hotspots
      .map((hotspot) => hotspot.deviceId.trim())
      .filter((deviceId) => deviceId.length > 0),
  );
  const unplacedDevices = deviceCatalog.filter((device) => !placedDeviceIds.has(device.device_id));
  const selectedHotspot =
    visibleHotspots.find((hotspot) => hotspot.id === selectedHotspotId) ??
    draftState.hotspots.find((hotspot) => hotspot.id === selectedHotspotId) ??
    null;
  const selectedBatchHotspots = sortHotspots(
    draftState.hotspots.filter((hotspot) => batchSelectedHotspotIds.includes(hotspot.id)),
  );
  const localPublishSummary = buildLocalPublishSummary(draftState, publishBaseline);
  const effectivePublishSummary =
    publishSummary.totalChanges > 0 ? publishSummary : localPublishSummary;
  const effectivePublishSummaryError =
    effectivePublishSummary.totalChanges > 0 ? null : publishSummaryError;
  const effectivePublishSummaryLoading =
    publishSummaryLoading && effectivePublishSummary.totalChanges === 0;
  const canEdit = !editor.readonly && editor.lockStatus === "GRANTED";
  const canAcquire =
    pin.active && editor.lockStatus !== "GRANTED" && editor.lockStatus !== "LOCKED_BY_OTHER";
  const canTakeover = pin.active && editor.lockStatus === "LOCKED_BY_OTHER" && Boolean(editor.leaseId);
  const canDiscard = canEdit && Boolean(editor.leaseId && editor.draftVersion);
  const canUndo = canEdit && historyState.undoCount > 0;
  const canRedo = canEdit && historyState.redoCount > 0;

  function syncHistoryState(lastAction: string | null = historyState.lastAction) {
    setHistoryState({
      undoCount: undoStackRef.current.length,
      redoCount: redoStackRef.current.length,
      lastAction,
    });
  }

  function clearHistoryGroup() {
    if (historyGroupRef.current?.timer) {
      window.clearTimeout(historyGroupRef.current.timer);
    }
    historyGroupRef.current = null;
  }

  function markHistoryGroup(key: string) {
    if (historyGroupRef.current?.timer) {
      window.clearTimeout(historyGroupRef.current.timer);
    }
    historyGroupRef.current = {
      key,
      timer: window.setTimeout(() => {
        historyGroupRef.current = null;
      }, 700),
    };
  }

  function pushDraftHistory(current: EditorDraftState, label: string, groupKey?: string) {
    if (groupKey && historyGroupRef.current?.key === groupKey) {
      markHistoryGroup(groupKey);
      return;
    }

    if (groupKey) {
      markHistoryGroup(groupKey);
    } else {
      clearHistoryGroup();
    }

    undoStackRef.current = [
      ...undoStackRef.current,
      {
        draft: cloneEditorDraftState(current),
        selectedHotspotId,
        batchSelectedHotspotIds: [...batchSelectedHotspotIds],
        label,
      },
    ].slice(-50);
    redoStackRef.current = [];
    syncHistoryState(label);
  }

  function updateDraftStateWithHistory(
    updater: EditorDraftStateUpdater,
    label: string,
    groupKey?: string,
  ) {
    if (!canEdit) {
      return;
    }

    setDraftState((current) => {
      const next = updater(current);
      if (areEditorDraftStatesEqual(current, next)) {
        return current;
      }
      pushDraftHistory(current, label, groupKey);
      draftStateRef.current = next;
      return next;
    });
  }

  function restoreDraftHistoryEntry(entry: EditorHistoryEntry) {
    const restored = cloneEditorDraftState(entry.draft);
    draftStateRef.current = restored;
    setDraftState(restored);
    setSelectedHotspotId(entry.selectedHotspotId);
    setBatchSelectedHotspotIds([...entry.batchSelectedHotspotIds]);
  }

  function undoDraftChange() {
    if (!canEdit || !undoStackRef.current.length) {
      return;
    }

    clearHistoryGroup();
    const entry = undoStackRef.current[undoStackRef.current.length - 1];
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    redoStackRef.current = [
      ...redoStackRef.current,
      {
        draft: cloneEditorDraftState(draftState),
        selectedHotspotId,
        batchSelectedHotspotIds: [...batchSelectedHotspotIds],
        label: entry.label,
      },
    ].slice(-50);
    restoreDraftHistoryEntry(entry);
    syncHistoryState(entry.label);
    showEditorNotice({
      tone: "success",
      title: "已撤销",
      detail: `已恢复到“${entry.label}”之前的草稿状态。`,
    });
  }

  function redoDraftChange() {
    if (!canEdit || !redoStackRef.current.length) {
      return;
    }

    clearHistoryGroup();
    const entry = redoStackRef.current[redoStackRef.current.length - 1];
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    undoStackRef.current = [
      ...undoStackRef.current,
      {
        draft: cloneEditorDraftState(draftState),
        selectedHotspotId,
        batchSelectedHotspotIds: [...batchSelectedHotspotIds],
        label: entry.label,
      },
    ].slice(-50);
    restoreDraftHistoryEntry(entry);
    syncHistoryState(entry.label);
    showEditorNotice({
      tone: "success",
      title: "已重做",
      detail: `已重新应用“${entry.label}”。`,
    });
  }

  function selectSingleHotspot(hotspotId: string, options?: { keepBatch?: boolean }) {
    setSelectedHotspotId(hotspotId);
    if (!options?.keepBatch) {
      setBatchSelectedHotspotIds([]);
    }
  }

  function replaceBatchSelection(hotspotIds: string[]) {
    const next = Array.from(new Set(hotspotIds));
    setBatchSelectedHotspotIds(next);
    setSelectedHotspotId(next[0] ?? null);
  }

  function toggleBatchHotspot(hotspotId: string) {
    setBatchSelectedHotspotIds((current) =>
      current.includes(hotspotId)
        ? current.filter((selectedId) => selectedId !== hotspotId)
        : [...current, hotspotId],
    );
  }

  function handleCanvasHotspotPointer(
    hotspotId: string,
    options?: { toggleBatch?: boolean; preserveBatch?: boolean },
  ) {
    if (options?.toggleBatch) {
      toggleBatchHotspot(hotspotId);
      setSelectedHotspotId(hotspotId);
      return;
    }
    selectSingleHotspot(hotspotId, { keepBatch: options?.preserveBatch });
  }

  function selectAllVisibleHotspots() {
    replaceBatchSelection(visibleHotspots.map((hotspot) => hotspot.id));
  }

  function clearBatchSelection() {
    setBatchSelectedHotspotIds([]);
  }

  function updateHotspotField(
    field: EditorHotspotField,
    value: string,
  ) {
    if (!selectedHotspotId) {
      return;
    }

    updateDraftStateWithHistory((current) => {
      const nextHotspots = current.hotspots.map((hotspot) => {
        if (hotspot.id !== selectedHotspotId) {
          return hotspot;
        }

        if (field === "x" || field === "y") {
          const next = Math.min(Math.max(Number(value) / 100, 0), 1);
          return { ...hotspot, [field]: Number.isFinite(next) ? next : hotspot[field] };
        }

        if (field === "structureOrder") {
          const next = Number(value);
          return {
            ...hotspot,
            structureOrder: Number.isFinite(next)
              ? Math.max(0, Math.round(next))
              : hotspot.structureOrder,
          };
        }

        if (field === "label") {
          return { ...hotspot, label: value };
        }

        if (field === "deviceId") {
          const device = deviceCatalog.find((item) => item.device_id === value);
          return { ...hotspot, deviceId: value, label: device?.display_name ?? hotspot.label };
        }

        if (field === "iconType") {
          return { ...hotspot, iconType: value, iconAssetId: null, iconAssetUrl: null };
        }

        return { ...hotspot, [field]: value };
      });

      return {
        ...current,
        hotspots:
          field === "structureOrder" ? resequenceHotspots(nextHotspots) : nextHotspots,
      };
    }, "修改热点属性", field === "label" || field === "deviceId" ? `field-${field}` : undefined);
  }

  async function handleUploadBackground(file: File) {
    if (!canEdit) {
      return;
    }

    clearEditorFeedback();
    setIsUploadingBackground(true);
    try {
      const uploaded = await uploadFloorplanAsset({ file, replaceCurrent: false });
      updateDraftStateWithHistory((current) => ({
        ...current,
        backgroundAssetId: uploaded.asset_id,
        backgroundImageUrl: uploaded.background_image_url,
        backgroundImageSize: normalizeImageSize(uploaded.background_image_size),
      }), "更新背景图");
      showEditorNotice({
        tone: "success",
        title: "背景图已更新",
        detail: "图片已上传并应用到当前草稿。保存草稿后会写入后端，发布后进入首页布局。",
      });
    } catch (error) {
      await handleEditorActionError(error, "upload");
    } finally {
      setIsUploadingBackground(false);
    }
  }

  async function handleUploadHotspotIcon(file: File) {
    if (!canEdit || !selectedHotspotId) {
      return;
    }

    clearEditorFeedback();
    setIsUploadingHotspotIcon(true);
    try {
      const uploaded = await uploadHotspotIconAsset({ file });
      updateDraftStateWithHistory((current) => ({
        ...current,
        hotspots: current.hotspots.map((hotspot) =>
          hotspot.id === selectedHotspotId
            ? {
                ...hotspot,
                iconAssetId: uploaded.asset_id,
                iconAssetUrl: uploaded.icon_asset_url,
              }
            : hotspot,
        ),
      }), "Upload hotspot icon");
      showEditorNotice({
        tone: "success",
        title: "Hotspot icon uploaded",
        detail: "The custom icon is attached to the selected hotspot. Save and publish to use it on the home page.",
      });
    } catch (error) {
      await handleEditorActionError(error, "upload");
    } finally {
      setIsUploadingHotspotIcon(false);
    }
  }

  function clearSelectedHotspotIconAsset() {
    if (!canEdit || !selectedHotspotId) {
      return;
    }
    updateDraftStateWithHistory((current) => ({
      ...current,
      hotspots: current.hotspots.map((hotspot) =>
        hotspot.id === selectedHotspotId
          ? { ...hotspot, iconAssetId: null, iconAssetUrl: null }
          : hotspot,
      ),
    }), "Clear hotspot icon");
  }

  function handleClearBackground() {
    if (!canEdit) {
      return;
    }

    updateDraftStateWithHistory((current) => ({
      ...current,
      backgroundAssetId: null,
      backgroundImageUrl: null,
      backgroundImageSize: null,
    }), "清除背景图");
    showEditorNotice({
      tone: "success",
      title: "背景图已清除",
      detail: "当前草稿已切回默认户型底图。保存草稿后会写入后端，发布后进入首页布局。",
    });
  }

  function updateHotspotVisibility(visible: boolean) {
    if (!selectedHotspotId) {
      return;
    }

    updateDraftStateWithHistory((current) => ({
      ...current,
      hotspots: current.hotspots.map((hotspot) =>
        hotspot.id === selectedHotspotId ? { ...hotspot, isVisible: visible } : hotspot,
      ),
    }), "切换热点显示");
  }

  function updateBatchHotspots(
    updater: (hotspot: EditorHotspotViewModel, selected: EditorHotspotViewModel[]) => EditorHotspotViewModel,
    label = "批量编辑热点",
  ) {
    if (!canEdit || !batchSelectedHotspotIds.length) {
      return;
    }

    const selectedSet = new Set(batchSelectedHotspotIds);
    updateDraftStateWithHistory((current) => {
      const selected = sortHotspots(current.hotspots.filter((hotspot) => selectedSet.has(hotspot.id)));
      if (!selected.length) {
        return current;
      }

      return {
        ...current,
        hotspots: current.hotspots.map((hotspot) =>
          selectedSet.has(hotspot.id) ? updater(hotspot, selected) : hotspot,
        ),
      };
    }, label);
  }

  function alignBatchHotspots(action: EditorBulkAlignAction) {
    updateBatchHotspots((hotspot, selected) => {
      if (selected.length < 2) {
        return hotspot;
      }
      const xValues = selected.map((item) => item.x);
      const yValues = selected.map((item) => item.y);
      const targetX =
        action === "left"
          ? Math.min(...xValues)
          : action === "right"
            ? Math.max(...xValues)
            : action === "centerX"
              ? xValues.reduce((total, value) => total + value, 0) / xValues.length
              : hotspot.x;
      const targetY =
        action === "top"
          ? Math.min(...yValues)
          : action === "bottom"
            ? Math.max(...yValues)
            : action === "centerY"
              ? yValues.reduce((total, value) => total + value, 0) / yValues.length
              : hotspot.y;
      return {
        ...hotspot,
        x: clampPosition(targetX),
        y: clampPosition(targetY),
      };
    }, "批量对齐热点");
  }

  function distributeBatchHotspots(action: EditorBulkDistributeAction) {
    if (!canEdit || batchSelectedHotspotIds.length < 3) {
      return;
    }

    const selectedSet = new Set(batchSelectedHotspotIds);
    updateDraftStateWithHistory((current) => {
      const selected = current.hotspots
        .filter((hotspot) => selectedSet.has(hotspot.id))
        .sort((left, right) => (action === "horizontal" ? left.x - right.x : left.y - right.y));
      if (selected.length < 3) {
        return current;
      }

      const first = action === "horizontal" ? selected[0].x : selected[0].y;
      const last =
        action === "horizontal"
          ? selected[selected.length - 1].x
          : selected[selected.length - 1].y;
      const step = (last - first) / (selected.length - 1);
      const targetById = new Map(
        selected.map((hotspot, index) => [hotspot.id, clampPosition(first + step * index)]),
      );

      return {
        ...current,
        hotspots: current.hotspots.map((hotspot) => {
          const target = targetById.get(hotspot.id);
          if (target === undefined) {
            return hotspot;
          }
          return action === "horizontal" ? { ...hotspot, x: target } : { ...hotspot, y: target };
        }),
      };
    }, "批量等距分布");
  }

  function setBatchPosition(axis: "x" | "y", value: string) {
    const next = Number(value);
    if (!Number.isFinite(next)) {
      return;
    }
    const position = clampPosition(next / 100);
    updateBatchHotspots((hotspot) => ({ ...hotspot, [axis]: position }), "批量设置坐标");
  }

  function distributeBatchHotspotsByStep(axis: "x" | "y", value: string) {
    const stepValue = Number(value);
    if (!Number.isFinite(stepValue) || stepValue <= 0 || batchSelectedHotspotIds.length < 2) {
      return;
    }

    const step = stepValue / 100;
    const selectedSet = new Set(batchSelectedHotspotIds);
    updateDraftStateWithHistory((current) => {
      const selected = current.hotspots
        .filter((hotspot) => selectedSet.has(hotspot.id))
        .sort((left, right) => left[axis] - right[axis]);
      if (selected.length < 2) {
        return current;
      }

      const start = selected[0][axis];
      const targetById = new Map(
        selected.map((hotspot, index) => [hotspot.id, clampPosition(start + step * index)]),
      );
      return {
        ...current,
        hotspots: current.hotspots.map((hotspot) => {
          const target = targetById.get(hotspot.id);
          return target === undefined ? hotspot : { ...hotspot, [axis]: target };
        }),
      };
    }, "按数值分布热点");
  }

  function setBatchVisibility(visible: boolean) {
    updateBatchHotspots((hotspot) => ({ ...hotspot, isVisible: visible }), "批量切换显示");
  }

  function setBatchIconType(iconType: string) {
    updateBatchHotspots((hotspot) => ({ ...hotspot, iconType }), "批量设置图标");
  }

  function setBatchLabelMode(labelMode: string) {
    updateBatchHotspots((hotspot) => ({ ...hotspot, labelMode }), "批量设置标签模式");
  }

  function nudgeSelectedHotspot(direction: "left" | "right" | "up" | "down", delta = 0.01) {
    const targetIds = batchSelectedHotspotIds.length
      ? batchSelectedHotspotIds
      : selectedHotspotId
        ? [selectedHotspotId]
        : [];
    if (!targetIds.length || !canEdit) {
      return;
    }

    const targetSet = new Set(targetIds);
    updateDraftStateWithHistory((current) => ({
      ...current,
      hotspots: current.hotspots.map((hotspot) => {
        if (!targetSet.has(hotspot.id)) {
          return hotspot;
        }
        const xDelta = direction === "left" ? -delta : direction === "right" ? delta : 0;
        const yDelta = direction === "up" ? -delta : direction === "down" ? delta : 0;
        return {
          ...hotspot,
          x: Math.min(Math.max(hotspot.x + xDelta, 0), 1),
          y: Math.min(Math.max(hotspot.y + yDelta, 0), 1),
        };
      }),
    }), "移动热点", "nudge-hotspots");
  }

  function duplicateSelectedHotspot() {
    if (!selectedHotspot || !canEdit) {
      return;
    }

    const duplicatedHotspot: EditorHotspotViewModel = {
      ...selectedHotspot,
      id: `${selectedHotspot.id}-copy-${Date.now()}`,
      label: `${selectedHotspot.label} 副本`,
      x: Math.min(selectedHotspot.x + 0.04, 1),
      y: Math.min(selectedHotspot.y + 0.04, 1),
      structureOrder: draftState.hotspots.length,
    };

    updateDraftStateWithHistory((current) => ({
      ...current,
      hotspots: resequenceHotspots([...current.hotspots, duplicatedHotspot]),
    }), "复制热点");
    setSelectedHotspotId(duplicatedHotspot.id);
    setBatchSelectedHotspotIds([]);
  }

  function moveHotspot(hotspotId: string, x: number, y: number) {
    if (!canEdit) {
      return;
    }

    setSelectedHotspotId(hotspotId);
    updateDraftStateWithHistory((current) => ({
      ...current,
      hotspots: current.hotspots.map((hotspot) =>
        hotspot.id === hotspotId ? { ...hotspot, x, y } : hotspot,
      ),
    }), "拖动热点", "drag-hotspots");
  }

  function moveHotspotGroup(updates: Array<{ hotspotId: string; x: number; y: number }>) {
    if (!canEdit || !updates.length) {
      return;
    }

    const updatesById = new Map(
      updates.map((update) => [update.hotspotId, { x: update.x, y: update.y }]),
    );
    updateDraftStateWithHistory((current) => ({
      ...current,
      hotspots: current.hotspots.map((hotspot) => {
        const next = updatesById.get(hotspot.id);
        return next ? { ...hotspot, x: next.x, y: next.y } : hotspot;
      }),
    }), "拖动热点", "drag-hotspots");
  }

  function addHotspot() {
    if (!canEdit) {
      return;
    }

    const newHotspot: EditorHotspotViewModel = {
      id: `draft-hotspot-${Date.now()}`,
      label: `热点 ${draftState.hotspots.length + 1}`,
      deviceId: "",
      x: 0.5,
      y: 0.5,
      iconType: "device",
      iconAssetId: null,
      iconAssetUrl: null,
      labelMode: "AUTO",
      isVisible: true,
      structureOrder: draftState.hotspots.length,
    };

    updateDraftStateWithHistory((current) => ({
      ...current,
      hotspots: resequenceHotspots([...current.hotspots, newHotspot]),
    }), "新增热点");
    setSelectedHotspotId(newHotspot.id);
    setBatchSelectedHotspotIds([]);
  }

  function addDeviceHotspot(device: DeviceListItemDto) {
    if (!canEdit) {
      return;
    }

    const existingHotspot = draftState.hotspots.find(
      (hotspot) => hotspot.deviceId.trim() === device.device_id,
    );
    if (existingHotspot) {
      setSelectedHotspotId(existingHotspot.id);
      return;
    }

    const position = getNextHotspotPosition(draftState.hotspots.length);
    const newHotspot: EditorHotspotViewModel = {
      id: buildDeviceHotspotId(device.device_id),
      label: device.display_name,
      deviceId: device.device_id,
      x: position.x,
      y: position.y,
      iconType: deriveHotspotIconKey(device.device_type, device.device_type),
      iconAssetId: null,
      iconAssetUrl: null,
      labelMode: "AUTO",
      isVisible: true,
      structureOrder: draftState.hotspots.length,
    };

    updateDraftStateWithHistory((current) => ({
      ...current,
      hotspots: resequenceHotspots([...current.hotspots, newHotspot]),
    }), "添加设备热点");
    setSelectedHotspotId(newHotspot.id);
    setBatchSelectedHotspotIds([]);
    showEditorNotice({
      tone: "success",
      title: "草稿已更新",
      detail: "设备已加入当前草稿。保存草稿后会写入后端，发布后进入首页布局。",
    });
  }

  function deleteSelectedHotspot() {
    if (!selectedHotspotId || !canEdit) {
      return;
    }

    const deletedHotspotId = selectedHotspotId;
    updateDraftStateWithHistory((current) => {
      const nextHotspots = resequenceHotspots(
        current.hotspots.filter((hotspot) => hotspot.id !== deletedHotspotId),
      );
      return {
        ...current,
        hotspots: nextHotspots,
      };
    }, "删除热点");
    setSelectedHotspotId((current) => (current === deletedHotspotId ? null : current));
    setBatchSelectedHotspotIds((current) =>
      current.filter((hotspotId) => hotspotId !== deletedHotspotId),
    );
  }

  function moveSelectedHotspot(direction: "up" | "down") {
    if (!selectedHotspotId || !canEdit) {
      return;
    }

    updateDraftStateWithHistory((current) => {
      const ordered = sortHotspots(current.hotspots);
      const currentIndex = ordered.findIndex((hotspot) => hotspot.id === selectedHotspotId);
      if (currentIndex === -1) {
        return current;
      }

      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= ordered.length) {
        return current;
      }

      const next = [...ordered];
      const [moved] = next.splice(currentIndex, 1);
      next.splice(targetIndex, 0, moved);

      return {
        ...current,
        hotspots: next.map((hotspot, index) => ({ ...hotspot, structureOrder: index })),
      };
    }, "调整热点排序");
  }

  useEffect(() => {
    function handleEditorShortcut(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      const hasCommandModifier = event.metaKey || event.ctrlKey;
      const isTyping = isTextEditingTarget(event.target);

      if (hasCommandModifier && key === "s") {
        event.preventDefault();
        if (canEdit && !isSavingDraft) {
          void handleSaveDraft();
        }
        return;
      }

      if (isTyping) {
        return;
      }

      if (hasCommandModifier && key === "enter") {
        event.preventDefault();
        if (canEdit && !isPublishingDraft) {
          void handlePublishDraft();
        }
        return;
      }

      if (hasCommandModifier && key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redoDraftChange();
        } else {
          undoDraftChange();
        }
        return;
      }

      if (hasCommandModifier && key === "y") {
        event.preventDefault();
        redoDraftChange();
        return;
      }

      if (hasCommandModifier && key === "a") {
        event.preventDefault();
        selectAllVisibleHotspots();
        return;
      }

      if (hasCommandModifier && key === "d") {
        event.preventDefault();
        duplicateSelectedHotspot();
        return;
      }

      if (key === "escape") {
        clearBatchSelection();
        return;
      }

      if (key === "delete" || key === "backspace") {
        if (selectedHotspotId) {
          event.preventDefault();
          deleteSelectedHotspot();
        }
        return;
      }

      const direction =
        key === "arrowleft"
          ? "left"
          : key === "arrowright"
            ? "right"
            : key === "arrowup"
              ? "up"
              : key === "arrowdown"
                ? "down"
                : null;
      if (direction) {
        event.preventDefault();
        const delta = event.shiftKey ? 0.05 : event.altKey ? 0.001 : 0.01;
        nudgeSelectedHotspot(direction, delta);
      }
    }

    window.addEventListener("keydown", handleEditorShortcut);
    return () => {
      window.removeEventListener("keydown", handleEditorShortcut);
    };
  }, [
    batchSelectedHotspotIds,
    canEdit,
    canRedo,
    canUndo,
    draftState,
    historyState,
    isPublishingDraft,
    isSavingDraft,
    selectedHotspotId,
    visibleHotspots,
  ]);

  useEffect(() => {
    const pendingEvents: WsEvent[] = [];
    for (const event of events) {
      if (event.event_id === handledRealtimeEventIdRef.current) {
        break;
      }
      pendingEvents.push(event);
    }

    if (!pendingEvents.length) {
      return;
    }

    handledRealtimeEventIdRef.current = pendingEvents[0].event_id;

    const takeoverEvent = pendingEvents.find(
      (event): event is DraftTakenOverEvent =>
        isDraftTakenOverEvent(event) && event.payload.previous_terminal_id === terminalId,
    );

    if (takeoverEvent) {
      appStore.setEditorSession({
        lockStatus: "LOCKED_BY_OTHER",
        leaseId: takeoverEvent.payload.new_lease_id,
        leaseExpiresAt: null,
        heartbeatIntervalSeconds: null,
        lockedByTerminalId: takeoverEvent.payload.new_terminal_id,
      });
      appStore.setEditorDraftData({
        draft: editor.draft,
        draftVersion: editor.draftVersion,
        baseLayoutVersion: editor.baseLayoutVersion,
        readonly: true,
        lockStatus: "LOCKED_BY_OTHER",
      });
      setLockConflictNotice(takeoverEvent.payload.new_terminal_id);
      void refreshDraft(takeoverEvent.payload.new_lease_id).catch((error) => {
        showEditorNotice({
          tone: "error",
          title: "刷新草稿失败",
          detail: normalizeApiError(error).message,
          actions: ["refresh"],
        });
      });
      return;
    }

    const lostEvent = pendingEvents.find(
      (event): event is DraftLockLostEvent =>
        isDraftLockLostEvent(event) && event.payload.terminal_id === terminalId,
    );

    if (lostEvent) {
      const correlatedTakeoverEvent =
        lostEvent.payload.lost_reason === "TAKEN_OVER"
          ? events.find(
              (event): event is DraftTakenOverEvent =>
                isDraftTakenOverEvent(event) && event.payload.previous_terminal_id === terminalId,
            )
          : undefined;

      if (correlatedTakeoverEvent) {
        appStore.setEditorSession({
          lockStatus: "LOCKED_BY_OTHER",
          leaseId: correlatedTakeoverEvent.payload.new_lease_id,
          leaseExpiresAt: null,
          heartbeatIntervalSeconds: null,
          lockedByTerminalId: correlatedTakeoverEvent.payload.new_terminal_id,
        });
        appStore.setEditorDraftData({
          draft: editor.draft,
          draftVersion: editor.draftVersion,
          baseLayoutVersion: editor.baseLayoutVersion,
          readonly: true,
          lockStatus: "LOCKED_BY_OTHER",
        });
        setLockConflictNotice(correlatedTakeoverEvent.payload.new_terminal_id);
        void refreshDraft(correlatedTakeoverEvent.payload.new_lease_id).catch((error) => {
          showEditorNotice({
            tone: "error",
            title: "刷新草稿失败",
            detail: normalizeApiError(error).message,
            actions: ["refresh"],
          });
        });
        return;
      }

      appStore.setEditorSession({
        lockStatus: "READ_ONLY",
        leaseId: null,
        leaseExpiresAt: null,
        heartbeatIntervalSeconds: null,
        lockedByTerminalId: null,
      });
      appStore.setEditorDraftData({
        draft: editor.draft,
        draftVersion: editor.draftVersion,
        baseLayoutVersion: editor.baseLayoutVersion,
        readonly: true,
        lockStatus: "READ_ONLY",
      });
      showEditorNotice({
        tone: "warning",
        title: "编辑租约已失效",
        detail:
          lostEvent.payload.lost_reason === "TAKEN_OVER"
            ? "另一台终端已经接管当前草稿，页面已切换为只读。"
            : "当前编辑租约已经过期，页面已切换为只读，请重新申请编辑。",
        actions: ["refresh", "acquire"],
      });
      void refreshDraft().catch((error) => {
        showEditorNotice({
          tone: "error",
          title: "刷新草稿失败",
          detail: normalizeApiError(error).message,
          actions: ["refresh"],
        });
      });
      return;
    }

    const versionConflictEvent = pendingEvents.find(
      (event): event is VersionConflictDetectedEvent => isVersionConflictDetectedEvent(event),
    );

    if (versionConflictEvent) {
      showEditorNotice({
        tone: "warning",
        title: "实时快照已重新同步",
        detail: "连接恢复时检测到事件间隙，页面已经刷新到最新快照，请确认当前草稿状态。",
        actions: ["refresh"],
      });
    }
  }, [
    editor.baseLayoutVersion,
    editor.draft,
    editor.draftVersion,
    editor.lockStatus,
    events,
    terminalId,
  ]);

  useEffect(() => {
    if (editor.lockStatus !== "GRANTED" || !editor.leaseId) {
      return;
    }

    const intervalSeconds = editor.heartbeatIntervalSeconds ?? 20;
    const heartbeatDelayMs = Math.max(5_000, Math.floor(intervalSeconds * 750));
    let active = true;

    async function renewLease() {
      if (!editor.leaseId) {
        return;
      }

      try {
        const heartbeat = await heartbeatEditorSession(editor.leaseId);
        if (!active) {
          return;
        }
        appStore.setEditorSession({
          lockStatus: heartbeat.lock_status,
          leaseId: heartbeat.lease_id,
          leaseExpiresAt: heartbeat.lease_expires_at,
          lockedByTerminalId: null,
        });
      } catch (error) {
        if (!active) {
          return;
        }
        await handleEditorActionError(error, "acquire");
      }
    }

    const timer = window.setInterval(() => {
      void renewLease();
    }, heartbeatDelayMs);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [editor.heartbeatIntervalSeconds, editor.leaseId, editor.lockStatus]);

  async function persistDraft(options?: {
    silent?: boolean;
    errorAction?: "save" | "publish";
  }) {
    if (!editor.leaseId || !editor.draftVersion || !editor.baseLayoutVersion || !canEdit) {
      return null;
    }

    try {
      const parsedLayoutMeta = parseLayoutMetaText(draftState.layoutMetaText);
      const layoutMeta = buildLayoutMetaWithHotspotLabels(parsedLayoutMeta, draftState.hotspots);
      await saveEditorDraft({
        lease_id: editor.leaseId,
        draft_version: editor.draftVersion,
        base_layout_version: editor.baseLayoutVersion,
        background_asset_id: draftState.backgroundAssetId,
        layout_meta: layoutMeta,
        hotspots: buildDraftHotspotInputs(draftState.hotspots),
      });
      const refreshed = await refreshDraft(editor.leaseId);
      appStore.setEditorSession({
        lockStatus: "GRANTED",
        leaseId: editor.leaseId,
        leaseExpiresAt: editor.leaseExpiresAt,
        heartbeatIntervalSeconds: editor.heartbeatIntervalSeconds,
        lockedByTerminalId: null,
      });
      if (!options?.silent) {
        showEditorNotice({
          tone: "success",
          title: "草稿已保存",
          detail: "当前修改已经写入后端草稿。",
        });
      }
      return refreshed;
    } catch (error) {
      await handleEditorActionError(error, options?.errorAction ?? "save");
      return null;
    }
  }

  async function handleSaveDraft() {
    clearEditorFeedback();
    setIsSavingDraft(true);
    try {
      await persistDraft();
    } finally {
      setIsSavingDraft(false);
    }
  }

  async function handlePublishDraft() {
    if (!editor.leaseId || !canEdit) {
      return;
    }

    clearEditorFeedback();
    setIsPublishingDraft(true);
    try {
      const refreshed = await persistDraft({ silent: true, errorAction: "publish" });
      if (!refreshed?.draft_version || !refreshed.base_layout_version) {
        return;
      }

      const published = await publishEditorDraft({
        lease_id: editor.leaseId,
        draft_version: refreshed.draft_version,
        base_layout_version: refreshed.base_layout_version,
      });

      appStore.setEditorSession({
        lockStatus: "READ_ONLY",
        leaseId: null,
        leaseExpiresAt: null,
        heartbeatIntervalSeconds: null,
        lockedByTerminalId: null,
      });
      await refreshDraft();
      setSelectedHotspotId(null);
      setBatchSelectedHotspotIds([]);
      showEditorNotice({
        tone: "success",
        title: "草稿已发布",
        detail: `布局版本已更新为 ${published.layout_version}。`,
      });
    } catch (error) {
      await handleEditorActionError(error, "publish");
    } finally {
      setIsPublishingDraft(false);
    }
  }

  async function handleAcquireLock() {
    if (!canAcquire) {
      return;
    }

    clearEditorFeedback();
    setIsAcquiringLock(true);
    try {
      await openEditableSession();
    } catch (error) {
      await handleEditorActionError(error, "acquire");
    } finally {
      setIsAcquiringLock(false);
    }
  }

  async function handleTakeover() {
    if (!editor.leaseId || !canTakeover) {
      return;
    }

    clearEditorFeedback();
    setIsTakingOver(true);
    try {
      const takeover = await takeoverEditorSession(editor.leaseId);
      if (!takeover.taken_over || !takeover.new_lease_id) {
        showEditorNotice({
          tone: "warning",
          title: "接管未完成",
          detail: "请刷新锁状态后再试。",
          actions: ["refresh", "retry-takeover"],
        });
        return;
      }

      appStore.setEditorSession({
        lockStatus: "GRANTED",
        leaseId: takeover.new_lease_id,
        leaseExpiresAt: takeover.lease_expires_at ?? null,
        heartbeatIntervalSeconds: editor.heartbeatIntervalSeconds ?? 20,
        lockedByTerminalId: null,
      });
      await refreshDraft(takeover.new_lease_id);
      showEditorNotice({
        tone: "success",
        title: "已接管编辑租约",
        detail: takeover.previous_terminal_id
          ? `当前终端已接管终端 ${takeover.previous_terminal_id} 的编辑租约。`
          : "当前终端已接管编辑租约。",
      });
    } catch (error) {
      await handleEditorActionError(error, "takeover");
    } finally {
      setIsTakingOver(false);
    }
  }

  async function handleDiscardDraft() {
    if (!editor.leaseId || !canDiscard) {
      return;
    }

    clearEditorFeedback();
    setIsDiscardingDraft(true);
    try {
      await discardEditorDraft({
        lease_id: editor.leaseId,
        draft_version: editor.draftVersion,
      });
      appStore.setEditorSession({
        lockStatus: "READ_ONLY",
        leaseId: null,
        leaseExpiresAt: null,
        heartbeatIntervalSeconds: null,
        lockedByTerminalId: null,
      });
      await refreshDraft();
      setSelectedHotspotId(null);
      setBatchSelectedHotspotIds([]);
      showEditorNotice({
        tone: "success",
        title: "草稿已丢弃",
        detail: "编辑租约已释放，页面已回到只读快照。",
      });
    } catch (error) {
      await handleEditorActionError(error, "discard");
    } finally {
      setIsDiscardingDraft(false);
    }
  }

  const orderedHotspots = sortHotspots(draftState.hotspots);
  const selectedHotspotIndex = selectedHotspot
    ? orderedHotspots.findIndex((hotspot) => hotspot.id === selectedHotspot.id)
    : -1;

  function renderNoticeAction(action: EditorNoticeAction) {
    switch (action) {
      case "refresh":
        return (
          <button className="button button--ghost" onClick={() => void refreshDraft()} type="button">
            刷新草稿
          </button>
        );
      case "retry-save":
        return (
          <button className="button button--primary" onClick={() => void handleSaveDraft()} type="button">
            重新保存
          </button>
        );
      case "retry-publish":
        return (
          <button className="button button--primary" onClick={() => void handlePublishDraft()} type="button">
            重新发布
          </button>
        );
      case "retry-acquire":
      case "acquire":
        return canAcquire ? (
          <button className="button button--ghost" onClick={() => void handleAcquireLock()} type="button">
            重新申请编辑
          </button>
        ) : null;
      case "retry-takeover":
      case "takeover":
        return canTakeover ? (
          <button className="button button--primary" onClick={() => void handleTakeover()} type="button">
            接管当前锁
          </button>
        ) : null;
      case "retry-discard":
        return (
          <button className="button button--ghost" onClick={() => void handleDiscardDraft()} type="button">
            重新丢弃
          </button>
        );
    }
  }

  return (
    <section
      className={embedded ? "editor-workspace-embedded" : "page page--editor"}
    >
      {editorNotice ? (
        <section className={`editor-recovery editor-recovery--${editorNotice.tone}`}>
          <div>
            <strong>{editorNotice.title}</strong>
            <p>{editorNotice.detail}</p>
          </div>
          <div className="badge-row">
            {editorNotice.actions?.map((action) => (
              <span key={action}>{renderNoticeAction(action)}</span>
            ))}
          </div>
        </section>
      ) : null}
      <EditorCommandBar
        acquireBusy={isAcquiringLock}
        canAcquire={canAcquire}
        canSave={canEdit}
        canPublish={canEdit}
        canRedo={canRedo}
        canTakeover={canTakeover}
        canUndo={canUndo}
        canDiscard={canDiscard}
        embedded={embedded}
        helperText={viewModel.helperText}
        historyLabel={historyState.lastAction}
        hotspotCount={draftState.hotspots.length}
        modeLabel={viewModel.modeLabel}
        onAddHotspot={addHotspot}
        onAcquire={() => void handleAcquireLock()}
        onDiscardDraft={() => void handleDiscardDraft()}
        onPublishDraft={() => void handlePublishDraft()}
        onRedo={redoDraftChange}
        onSaveDraft={() => void handleSaveDraft()}
        onTakeover={() => void handleTakeover()}
        onUndo={undoDraftChange}
        discardBusy={isDiscardingDraft}
        publishBusy={isPublishingDraft}
        rows={viewModel.commandRows}
        saveBusy={isSavingDraft}
        takeoverBusy={isTakingOver}
      />
      <EditorPublishSummary
        errorMessage={effectivePublishSummaryError}
        isLoading={effectivePublishSummaryLoading}
        items={effectivePublishSummary.items}
        totalChanges={effectivePublishSummary.totalChanges}
      />
      <div className="editor-workbench">
        <EditorToolbox
          batchSelectedHotspotIds={batchSelectedHotspotIds}
          canEdit={canEdit}
          devicesLoading={deviceCatalogLoading}
          hotspots={visibleHotspots}
          unplacedDevices={unplacedDevices}
          onAddDeviceHotspot={addDeviceHotspot}
          onClearBatchSelection={clearBatchSelection}
          onSearchChange={setSearchValue}
          onSelectAllHotspots={selectAllVisibleHotspots}
          onSelectHotspot={selectSingleHotspot}
          onToggleBatchHotspot={toggleBatchHotspot}
          searchValue={searchValue}
          selectedHotspotId={selectedHotspotId}
        />
        <EditorCanvasWorkspace
          batchSelectedHotspotIds={batchSelectedHotspotIds}
          backgroundImageSize={draftState.backgroundImageSize}
          backgroundImageUrl={draftState.backgroundImageUrl}
          canEdit={canEdit}
          hotspots={draftState.hotspots}
          mode={canvasMode}
          onBackgroundImageSizeChange={(backgroundImageSize) => {
            setDraftState((current) => {
              const sameWidth = current.backgroundImageSize?.width === backgroundImageSize.width;
              const sameHeight = current.backgroundImageSize?.height === backgroundImageSize.height;
              return sameWidth && sameHeight
                ? current
                : {
                    ...current,
                    backgroundImageSize,
                  };
            });
          }}
          onModeChange={setCanvasMode}
          onMoveHotspot={moveHotspot}
          onMoveHotspots={moveHotspotGroup}
          onReplaceBatchSelection={replaceBatchSelection}
          onSelectHotspot={handleCanvasHotspotPointer}
          selectedHotspotId={selectedHotspotId}
        />
        <EditorInspector
          batchHotspots={selectedBatchHotspots}
          backgroundAssetId={draftState.backgroundAssetId}
          backgroundImageUrl={draftState.backgroundImageUrl}
          canEdit={canEdit}
          devices={deviceCatalog}
          hotspot={selectedHotspot}
          layoutMetaText={draftState.layoutMetaText}
          canMoveDown={selectedHotspotIndex > -1 && selectedHotspotIndex < orderedHotspots.length - 1}
          canMoveUp={selectedHotspotIndex > 0}
          isUploadingBackground={isUploadingBackground}
          isUploadingHotspotIcon={isUploadingHotspotIcon}
          onBulkAlign={alignBatchHotspots}
          onBulkDistribute={distributeBatchHotspots}
          onBulkDistributeByStep={distributeBatchHotspotsByStep}
          onBulkSetPosition={setBatchPosition}
          onBulkSetIconType={setBatchIconType}
          onBulkSetLabelMode={setBatchLabelMode}
          onBulkSetVisibility={setBatchVisibility}
          onChangeHotspot={updateHotspotField}
          onChangeLayoutMeta={(value) =>
            updateDraftStateWithHistory(
              (current) => ({ ...current, layoutMetaText: value }),
              "修改布局元数据",
              "layout-meta",
            )
          }
          onClearBackground={handleClearBackground}
          onClearBatchSelection={clearBatchSelection}
          onDeleteHotspot={deleteSelectedHotspot}
          onDuplicateHotspot={duplicateSelectedHotspot}
          onMoveHotspot={moveSelectedHotspot}
          onNudgeHotspot={nudgeSelectedHotspot}
          onUploadBackground={(file) => void handleUploadBackground(file)}
          onUploadHotspotIcon={(file) => void handleUploadHotspotIcon(file)}
          onClearHotspotIcon={clearSelectedHotspotIconAsset}
          onToggleVisibility={updateHotspotVisibility}
          rows={viewModel.commandRows}
        />
      </div>
      <EditorRealtimeFeed rows={viewModel.eventRows} />
    </section>
  );
}
