import { useEffect, useRef, useState } from "react";
import {
  createEditorSession,
  discardEditorDraft,
  fetchEditorDraft,
  heartbeatEditorSession,
  publishEditorDraft,
  saveEditorDraft,
  takeoverEditorSession,
} from "../../api/editorApi";
import { normalizeApiError } from "../../api/httpClient";
import {
  buildDraftHotspotInputs,
  buildLayoutMetaWithHotspotLabels,
  parseLayoutMetaText,
  type EditorDraftState,
} from "../editorDraftState";
import {
  asDetailRecord,
  asDetailString,
  buildEditorErrorNotice,
  formatLockLostDetail,
  formatVersionConflictDetail,
  type EditorActionKind,
  type EditorNoticeState,
} from "../editorWorkbenchNotices";
import { appStore } from "../../store/useAppStore";
import { WsEvent } from "../../ws/types";

interface EditorSessionFlowState {
  lockStatus: string | null;
  leaseId: string | null;
  leaseExpiresAt: string | null;
  heartbeatIntervalSeconds: number | null;
  lockedByTerminalId: string | null;
  draft: Record<string, unknown> | null;
  draftVersion: string | null;
  baseLayoutVersion: string | null;
  readonly: boolean;
}

interface UseEditorSessionFlowOptions {
  canEdit: boolean;
  draftState: EditorDraftState;
  editor: EditorSessionFlowState;
  events: WsEvent[];
  pinActive: boolean;
  pinSessionActive: boolean;
  resetSelection: () => void;
  terminalId?: string | null;
}

type DraftLockLostEvent = Extract<WsEvent, { event_type: "draft_lock_lost" }>;
type DraftTakenOverEvent = Extract<WsEvent, { event_type: "draft_taken_over" }>;
type VersionConflictDetectedEvent = Extract<
  WsEvent,
  { event_type: "version_conflict_detected" }
>;

function isDraftLockLostEvent(event: WsEvent): event is DraftLockLostEvent {
  return event.event_type === "draft_lock_lost";
}

function isDraftTakenOverEvent(event: WsEvent): event is DraftTakenOverEvent {
  return event.event_type === "draft_taken_over";
}

function isVersionConflictDetectedEvent(
  event: WsEvent,
): event is VersionConflictDetectedEvent {
  return event.event_type === "version_conflict_detected";
}

export function useEditorSessionFlow({
  canEdit,
  draftState,
  editor,
  events,
  pinActive,
  pinSessionActive,
  resetSelection,
  terminalId,
}: UseEditorSessionFlowOptions) {
  const [editorNotice, setEditorNotice] =
    useState<EditorNoticeState | null>(null);
  const [isAcquiringLock, setIsAcquiringLock] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isPublishingDraft, setIsPublishingDraft] = useState(false);
  const [isTakingOver, setIsTakingOver] = useState(false);
  const [isDiscardingDraft, setIsDiscardingDraft] = useState(false);
  const handledRealtimeEventIdRef = useRef<string | null>(null);

  const canAcquire =
    pinActive &&
    editor.lockStatus !== "GRANTED" &&
    editor.lockStatus !== "LOCKED_BY_OTHER";
  const canTakeover =
    pinActive && editor.lockStatus === "LOCKED_BY_OTHER" && Boolean(editor.leaseId);
  const canDiscard = canEdit && Boolean(editor.leaseId && editor.draftVersion);

  function showEditorNotice(input: EditorNoticeState) {
    if (input.tone === "error") {
      appStore.setEditorError(input.detail);
    } else {
      appStore.clearEditorError();
    }
    setEditorNotice(input);
  }

  function clearEditorFeedback() {
    appStore.clearEditorError();
    setEditorNotice(null);
  }

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
        title:
          action === "publish"
            ? "发布前草稿版本已更新"
            : "保存前草稿版本已更新",
        detail: formatVersionConflictDetail(apiError.details, action),
        actions: [action === "publish" ? "retry-publish" : "retry-save"],
      });
      return;
    }

    if (
      apiError.code === "DRAFT_LOCK_LOST" ||
      apiError.code === "DRAFT_LOCK_TAKEN_OVER"
    ) {
      const activeLease = asDetailRecord(apiError.details?.active_lease);
      const activeLeaseId = asDetailString(activeLease?.lease_id);
      const activeTerminalId = asDetailString(activeLease?.terminal_id);
      if (
        apiError.details?.reason === "TERMINAL_MISMATCH" &&
        activeLeaseId &&
        activeTerminalId
      ) {
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
        actions:
          apiError.details?.reason === "TERMINAL_MISMATCH"
            ? ["refresh", "takeover"]
            : ["refresh", "acquire"],
      });
      return;
    }

    showEditorNotice(buildEditorErrorNotice(apiError, action));
  }

  async function persistDraft(options?: {
    silent?: boolean;
    errorAction?: "save" | "publish";
  }) {
    if (!editor.leaseId || !editor.draftVersion || !editor.baseLayoutVersion || !canEdit) {
      return null;
    }

    try {
      const parsedLayoutMeta = parseLayoutMetaText(draftState.layoutMetaText);
      const layoutMeta = buildLayoutMetaWithHotspotLabels(
        parsedLayoutMeta,
        draftState.hotspots,
      );
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
      const refreshed = await persistDraft({
        silent: true,
        errorAction: "publish",
      });
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
      resetSelection();
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
      resetSelection();
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
        isDraftTakenOverEvent(event) &&
        event.payload.previous_terminal_id === terminalId,
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
                isDraftTakenOverEvent(event) &&
                event.payload.previous_terminal_id === terminalId,
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
        void refreshDraft(correlatedTakeoverEvent.payload.new_lease_id).catch(
          (error) => {
            showEditorNotice({
              tone: "error",
              title: "刷新草稿失败",
              detail: normalizeApiError(error).message,
              actions: ["refresh"],
            });
          },
        );
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
      (event): event is VersionConflictDetectedEvent =>
        isVersionConflictDetectedEvent(event),
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

  return {
    canAcquire,
    canDiscard,
    canTakeover,
    clearEditorFeedback,
    editorNotice,
    handleAcquireLock,
    handleDiscardDraft,
    handleEditorActionError,
    handlePublishDraft,
    handleSaveDraft,
    handleTakeover,
    isAcquiringLock,
    isDiscardingDraft,
    isPublishingDraft,
    isSavingDraft,
    isTakingOver,
    refreshDraft,
    showEditorNotice,
  };
}
