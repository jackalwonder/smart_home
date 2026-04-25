import { useEffect, useRef, useState } from "react";
import {
  createEditorSession,
  fetchEditorDraft,
} from "../../api/editorApi";
import { normalizeApiError } from "../../api/httpClient";
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
import type { WsEvent } from "../../ws/types";
import {
  isDraftLockLostEvent,
  isDraftTakenOverEvent,
  isVersionConflictDetectedEvent,
  type DraftLockLostEvent,
  type DraftTakenOverEvent,
  type UseEditorSessionFlowOptions,
  type VersionConflictDetectedEvent,
} from "./editorSessionFlowTypes";
import { useEditorDraftLifecycle } from "./useEditorDraftLifecycle";
import { useEditorLeaseLifecycle } from "./useEditorLeaseLifecycle";
import { useEditorPublishFlow } from "./useEditorPublishFlow";

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
  const handledRealtimeEventIdRef = useRef<string | null>(null);

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

  const {
    canAcquire,
    canTakeover,
    handleAcquireLock,
    handleTakeover,
    isAcquiringLock,
    isTakingOver,
  } = useEditorLeaseLifecycle({
    editor,
    pinActive,
    applyEditorSession,
    clearEditorFeedback,
    fetchEditableSession: openEditableSession,
    handleEditorActionError,
    refreshDraft,
    showEditorNotice,
  });

  const {
    canDiscard,
    handleDiscardDraft,
    handleSaveDraft,
    isDiscardingDraft,
    isSavingDraft,
    persistDraft,
  } = useEditorDraftLifecycle({
    canEdit,
    draftState,
    editor,
    clearEditorFeedback,
    handleEditorActionError,
    refreshDraft,
    resetSelection,
    showEditorNotice,
  });

  const { handlePublishDraft, isPublishingDraft } = useEditorPublishFlow({
    canEdit,
    editor,
    clearEditorFeedback,
    handleEditorActionError,
    persistDraft,
    refreshDraft,
    resetSelection,
    showEditorNotice,
  });

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
