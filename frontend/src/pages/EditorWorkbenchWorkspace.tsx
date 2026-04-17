import { useEffect, useRef, useState } from "react";
import { EditorCanvasWorkspace } from "../components/editor/EditorCanvasWorkspace";
import { EditorCommandBar } from "../components/editor/EditorCommandBar";
import { EditorInspector } from "../components/editor/EditorInspector";
import { EditorRealtimeFeed } from "../components/editor/EditorRealtimeFeed";
import { EditorToolbox } from "../components/editor/EditorToolbox";
import {
  createEditorSession,
  discardEditorDraft,
  fetchEditorDraft,
  heartbeatEditorSession,
  publishEditorDraft,
  saveEditorDraft,
  takeoverEditorSession,
} from "../api/editorApi";
import { fetchDevices } from "../api/devicesApi";
import { normalizeApiError } from "../api/httpClient";
import { DeviceListItemDto } from "../api/types";
import { appStore, useAppStore } from "../store/useAppStore";
import { mapEditorViewModel } from "../view-models/editor";
import { EditorHotspotViewModel } from "../view-models/editor";
import { WsEvent } from "../ws/types";

interface EditorDraftState {
  backgroundImageUrl: string | null;
  layoutMetaText: string;
  hotspots: EditorHotspotViewModel[];
}

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

export function EditorWorkbenchWorkspace() {
  const session = useAppStore((state) => state.session);
  const editor = useAppStore((state) => state.editor);
  const pin = useAppStore((state) => state.pin);
  const events = useAppStore((state) => state.wsEvents);
  const terminalId = session.data?.terminalId;
  const pinSessionActive = session.data?.pinSessionActive ?? false;
  const [searchValue, setSearchValue] = useState("");
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null);
  const [draftState, setDraftState] = useState<EditorDraftState>({
    backgroundImageUrl: null,
    layoutMetaText: "{}",
    hotspots: [],
  });
  const [deviceCatalog, setDeviceCatalog] = useState<DeviceListItemDto[]>([]);
  const [deviceCatalogLoading, setDeviceCatalogLoading] = useState(false);
  const [editorNotice, setEditorNotice] = useState<EditorNoticeState | null>(null);
  const handledRealtimeEventIdRef = useRef<string | null>(null);
  const [isAcquiringLock, setIsAcquiringLock] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isPublishingDraft, setIsPublishingDraft] = useState(false);
  const [isTakingOver, setIsTakingOver] = useState(false);
  const [isDiscardingDraft, setIsDiscardingDraft] = useState(false);

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
    action:
      | "save"
      | "publish"
      | "acquire"
      | "takeover"
      | "discard",
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
        detail: "后端草稿版本已经变化，页面已刷新到最新草稿，请确认变更后重试。",
        actions: [action === "publish" ? "retry-publish" : "retry-save"],
      });
      return;
    }

    if (apiError.code === "DRAFT_LOCK_LOST" || apiError.code === "DRAFT_LOCK_TAKEN_OVER") {
      appStore.setEditorSession({
        lockStatus: "READ_ONLY",
        leaseId: null,
        leaseExpiresAt: null,
        heartbeatIntervalSeconds: null,
        lockedByTerminalId: null,
      });
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
        detail: "当前会话已经失去编辑锁。请先刷新草稿，再重新申请编辑或接管其他终端的锁。",
        actions: ["refresh", "acquire"],
      });
      return;
    }

    const actionLabel =
      action === "save"
        ? "保存草稿"
        : action === "publish"
          ? "发布草稿"
          : action === "acquire"
            ? "申请编辑"
            : action === "takeover"
              ? "接管编辑"
              : "丢弃草稿";
    const retryAction =
      action === "save"
        ? "retry-save"
        : action === "publish"
          ? "retry-publish"
          : action === "acquire"
            ? "retry-acquire"
            : action === "takeover"
              ? "retry-takeover"
              : "retry-discard";

    showEditorNotice({
      tone: "error",
      title: `${actionLabel}失败`,
      detail: apiError.message,
      actions: ["refresh", retryAction],
    });
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
    setDraftState({
      backgroundImageUrl: viewModel.backgroundImageUrl,
      layoutMetaText: stringifyLayoutMeta(viewModel.layoutMeta),
      hotspots: resequenceHotspots(viewModel.hotspots),
    });
    setSelectedHotspotId((current) => current ?? viewModel.hotspots[0]?.id ?? null);
  }, [editor.draft, editor.draftVersion, editor.baseLayoutVersion]);

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
  const canEdit = !editor.readonly && editor.lockStatus === "GRANTED";
  const canAcquire =
    pin.active && editor.lockStatus !== "GRANTED" && editor.lockStatus !== "LOCKED_BY_OTHER";
  const canTakeover = pin.active && editor.lockStatus === "LOCKED_BY_OTHER" && Boolean(editor.leaseId);
  const canDiscard = canEdit && Boolean(editor.leaseId && editor.draftVersion);

  function updateHotspotField(
    field: "deviceId" | "iconType" | "labelMode" | "x" | "y" | "structureOrder",
    value: string,
  ) {
    if (!selectedHotspotId) {
      return;
    }

    setDraftState((current) => {
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

        return { ...hotspot, [field]: value };
      });

      return {
        ...current,
        hotspots:
          field === "structureOrder" ? resequenceHotspots(nextHotspots) : nextHotspots,
      };
    });
  }

  function updateHotspotVisibility(visible: boolean) {
    if (!selectedHotspotId) {
      return;
    }

    setDraftState((current) => ({
      ...current,
      hotspots: current.hotspots.map((hotspot) =>
        hotspot.id === selectedHotspotId ? { ...hotspot, isVisible: visible } : hotspot,
      ),
    }));
  }

  function moveHotspot(hotspotId: string, x: number, y: number) {
    if (!canEdit) {
      return;
    }

    setDraftState((current) => ({
      ...current,
      hotspots: current.hotspots.map((hotspot) =>
        hotspot.id === hotspotId ? { ...hotspot, x, y } : hotspot,
      ),
    }));
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
      labelMode: "AUTO",
      isVisible: true,
      structureOrder: draftState.hotspots.length,
    };

    setDraftState((current) => ({
      ...current,
      hotspots: resequenceHotspots([...current.hotspots, newHotspot]),
    }));
    setSelectedHotspotId(newHotspot.id);
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
      iconType: "device",
      labelMode: "AUTO",
      isVisible: true,
      structureOrder: draftState.hotspots.length,
    };

    setDraftState((current) => ({
      ...current,
      hotspots: resequenceHotspots([...current.hotspots, newHotspot]),
    }));
    setSelectedHotspotId(newHotspot.id);
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

    setDraftState((current) => {
      const nextHotspots = resequenceHotspots(
        current.hotspots.filter((hotspot) => hotspot.id !== selectedHotspotId),
      );
      setSelectedHotspotId(nextHotspots[0]?.id ?? null);
      return {
        ...current,
        hotspots: nextHotspots,
      };
    });
  }

  function moveSelectedHotspot(direction: "up" | "down") {
    if (!selectedHotspotId || !canEdit) {
      return;
    }

    setDraftState((current) => {
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
    });
  }

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
      const layoutMeta = JSON.parse(draftState.layoutMetaText || "{}");
      await saveEditorDraft({
        lease_id: editor.leaseId,
        draft_version: editor.draftVersion,
        base_layout_version: editor.baseLayoutVersion,
        background_asset_id: draftState.backgroundImageUrl,
        layout_meta: layoutMeta && typeof layoutMeta === "object" ? layoutMeta : {},
        hotspots: draftState.hotspots.map((hotspot, index) => ({
          hotspot_id: hotspot.id,
          device_id: hotspot.deviceId.trim(),
          x: hotspot.x,
          y: hotspot.y,
          icon_type: hotspot.iconType,
          label_mode: hotspot.labelMode,
          is_visible: hotspot.isVisible,
          structure_order: hotspot.structureOrder ?? index,
        })),
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
    <section className="page page--editor">
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
        canTakeover={canTakeover}
        canDiscard={canDiscard}
        helperText={viewModel.helperText}
        hotspotCount={draftState.hotspots.length}
        modeLabel={viewModel.modeLabel}
        onAddHotspot={addHotspot}
        onAcquire={() => void handleAcquireLock()}
        onDiscardDraft={() => void handleDiscardDraft()}
        onPublishDraft={() => void handlePublishDraft()}
        onSaveDraft={() => void handleSaveDraft()}
        onTakeover={() => void handleTakeover()}
        discardBusy={isDiscardingDraft}
        publishBusy={isPublishingDraft}
        rows={viewModel.commandRows}
        saveBusy={isSavingDraft}
        takeoverBusy={isTakingOver}
      />
      <div className="editor-workbench">
        <EditorToolbox
          canEdit={canEdit}
          devicesLoading={deviceCatalogLoading}
          hotspots={visibleHotspots}
          unplacedDevices={unplacedDevices}
          onAddDeviceHotspot={addDeviceHotspot}
          onSearchChange={setSearchValue}
          onSelectHotspot={setSelectedHotspotId}
          searchValue={searchValue}
          selectedHotspotId={selectedHotspotId}
        />
        <EditorCanvasWorkspace
          backgroundImageUrl={draftState.backgroundImageUrl}
          canEdit={canEdit}
          hotspots={draftState.hotspots}
          onMoveHotspot={moveHotspot}
          onSelectHotspot={setSelectedHotspotId}
          selectedHotspotId={selectedHotspotId}
        />
        <EditorInspector
          backgroundImageUrl={draftState.backgroundImageUrl}
          canEdit={canEdit}
          hotspot={selectedHotspot}
          layoutMetaText={draftState.layoutMetaText}
          canMoveDown={selectedHotspotIndex > -1 && selectedHotspotIndex < orderedHotspots.length - 1}
          canMoveUp={selectedHotspotIndex > 0}
          onChangeHotspot={updateHotspotField}
          onChangeLayoutMeta={(value) =>
            setDraftState((current) => ({ ...current, layoutMetaText: value }))
          }
          onDeleteHotspot={deleteSelectedHotspot}
          onMoveHotspot={moveSelectedHotspot}
          onToggleVisibility={updateHotspotVisibility}
          rows={viewModel.commandRows}
        />
      </div>
      <EditorRealtimeFeed rows={viewModel.eventRows} />
    </section>
  );
}
