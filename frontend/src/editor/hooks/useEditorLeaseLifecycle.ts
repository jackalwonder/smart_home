import { useEffect, useState } from "react";
import { heartbeatEditorSession, takeoverEditorSession } from "../../api/editorApi";
import { appStore } from "../../store/useAppStore";
import type { EditorActionKind, EditorNoticeState } from "../editorWorkbenchNotices";
import type { EditorSessionFlowState } from "./editorSessionFlowTypes";

interface UseEditorLeaseLifecycleOptions {
  editor: EditorSessionFlowState;
  pinActive: boolean;
  applyEditorSession: (input: {
    lock_status: string | null;
    lease_id?: string | null;
    lease_expires_at?: string | null;
    heartbeat_interval_seconds?: number | null;
    locked_by?: { terminal_id?: string | null } | null;
  }) => void;
  clearEditorFeedback: () => void;
  fetchEditableSession: (options?: { silent?: boolean }) => Promise<unknown>;
  handleEditorActionError: (error: unknown, action: EditorActionKind) => Promise<void>;
  refreshDraft: (leaseId?: string | null) => Promise<unknown>;
  showEditorNotice: (input: EditorNoticeState) => void;
}

export function useEditorLeaseLifecycle({
  editor,
  pinActive,
  applyEditorSession,
  clearEditorFeedback,
  fetchEditableSession,
  handleEditorActionError,
  refreshDraft,
  showEditorNotice,
}: UseEditorLeaseLifecycleOptions) {
  const [isAcquiringLock, setIsAcquiringLock] = useState(false);
  const [isTakingOver, setIsTakingOver] = useState(false);

  const canAcquire =
    pinActive && editor.lockStatus !== "GRANTED" && editor.lockStatus !== "LOCKED_BY_OTHER";
  const canTakeover =
    pinActive && editor.lockStatus === "LOCKED_BY_OTHER" && Boolean(editor.leaseId);

  async function handleAcquireLock() {
    if (!canAcquire) {
      return;
    }

    clearEditorFeedback();
    setIsAcquiringLock(true);
    try {
      await fetchEditableSession();
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
        applyEditorSession({
          lock_status: heartbeat.lock_status,
          lease_id: heartbeat.lease_id,
          lease_expires_at: heartbeat.lease_expires_at,
          locked_by: null,
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
  }, [
    applyEditorSession,
    editor.heartbeatIntervalSeconds,
    editor.leaseId,
    editor.lockStatus,
    handleEditorActionError,
  ]);

  return {
    canAcquire,
    canTakeover,
    handleAcquireLock,
    handleTakeover,
    isAcquiringLock,
    isTakingOver,
  };
}
