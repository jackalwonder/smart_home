import { useCallback, useState } from "react";
import { createEditorSession, fetchEditorDraft } from "../../api/editorApi";
import { appStore } from "../../store/useAppStore";
import { type EditorNoticeState } from "../editorWorkbenchNotices";
import { type UseEditorSessionFlowOptions } from "./editorSessionFlowTypes";
import { useEditorActionErrorRecovery } from "./useEditorActionErrorRecovery";
import { useEditorDraftLifecycle } from "./useEditorDraftLifecycle";
import { useEditorLeaseLifecycle } from "./useEditorLeaseLifecycle";
import { useEditorPublishFlow } from "./useEditorPublishFlow";
import { useEditorRealtimeRecovery } from "./useEditorRealtimeRecovery";
import { useEditorSessionBootstrap } from "./useEditorSessionBootstrap";

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
  const [editorNotice, setEditorNotice] = useState<EditorNoticeState | null>(null);

  const showEditorNotice = useCallback((input: EditorNoticeState) => {
    if (input.tone === "error") {
      appStore.setEditorError(input.detail);
    } else {
      appStore.clearEditorError();
    }
    setEditorNotice(input);
  }, []);

  const clearEditorFeedback = useCallback(() => {
    appStore.clearEditorError();
    setEditorNotice(null);
  }, []);

  const setLockConflictNotice = useCallback((conflictTerminalId?: string | null) => {
    appStore.clearEditorError();
    setEditorNotice({
      tone: "warning",
      title: "编辑租约已被其他终端占用",
      detail: conflictTerminalId
        ? `终端 ${conflictTerminalId} 当前持有编辑锁。你可以先刷新只读草稿，确认后再接管。`
        : "当前编辑锁已经转移到其他终端。你可以先刷新只读草稿，确认后再接管。",
      actions: ["refresh", "takeover"],
    });
  }, []);

  const applyEditorSession = useCallback(
    (input: {
      lock_status: string | null;
      lease_id?: string | null;
      lease_expires_at?: string | null;
      heartbeat_interval_seconds?: number | null;
      locked_by?: { terminal_id?: string | null } | null;
    }) => {
      appStore.setEditorSession({
        lockStatus: input.lock_status,
        leaseId: input.lease_id ?? null,
        leaseExpiresAt: input.lease_expires_at ?? null,
        heartbeatIntervalSeconds: input.heartbeat_interval_seconds ?? null,
        lockedByTerminalId: input.locked_by?.terminal_id ?? null,
      });
    },
    [],
  );

  const applyEditorDraft = useCallback(
    (input: Awaited<ReturnType<typeof fetchEditorDraft>>) => {
      appStore.setEditorDraftData({
        draft: input.layout ?? null,
        draftVersion: input.draft_version,
        baseLayoutVersion: input.base_layout_version,
        readonly: input.readonly,
        lockStatus: input.lock_status,
      });
    },
    [],
  );

  const refreshDraft = useCallback(
    async (leaseId?: string | null) => {
      const refreshed = await fetchEditorDraft(leaseId);
      applyEditorDraft(refreshed);
      return refreshed;
    },
    [applyEditorDraft],
  );

  const openEditableSession = useCallback(
    async (options?: { silent?: boolean }) => {
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
    },
    [applyEditorDraft, applyEditorSession, setLockConflictNotice, showEditorNotice],
  );

  const { handleEditorActionError } = useEditorActionErrorRecovery({
    editor,
    refreshDraft,
    showEditorNotice,
  });

  const leaseFlow = useEditorLeaseLifecycle({
    editor,
    pinActive,
    applyEditorSession,
    clearEditorFeedback,
    fetchEditableSession: openEditableSession,
    handleEditorActionError,
    refreshDraft,
    showEditorNotice,
  });

  const draftFlow = useEditorDraftLifecycle({
    canEdit,
    draftState,
    editor,
    clearEditorFeedback,
    handleEditorActionError,
    refreshDraft,
    resetSelection,
    showEditorNotice,
  });

  const publishFlow = useEditorPublishFlow({
    canEdit,
    editor,
    clearEditorFeedback,
    handleEditorActionError,
    persistDraft: draftFlow.persistDraft,
    refreshDraft,
    resetSelection,
    showEditorNotice,
  });

  useEditorSessionBootstrap({
    applyEditorDraft,
    clearEditorFeedback,
    handleEditorActionError,
    openEditableSession,
    pinSessionActive,
    terminalId,
  });

  useEditorRealtimeRecovery({
    editor,
    events,
    refreshDraft,
    setLockConflictNotice,
    showEditorNotice,
    terminalId,
  });

  return {
    ...leaseFlow,
    ...draftFlow,
    ...publishFlow,
    clearEditorFeedback,
    editorNotice,
    handleEditorActionError,
    refreshDraft,
    showEditorNotice,
  };
}
