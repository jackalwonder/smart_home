import { useEffect, useRef } from "react";
import { normalizeApiError } from "../../api/httpClient";
import { appStore } from "../../store/useAppStore";
import type { WsEvent } from "../../ws/types";
import type { EditorNoticeState } from "../editorWorkbenchNotices";
import {
  isDraftLockLostEvent,
  isDraftTakenOverEvent,
  isVersionConflictDetectedEvent,
  type DraftLockLostEvent,
  type DraftTakenOverEvent,
  type EditorSessionFlowState,
  type VersionConflictDetectedEvent,
} from "./editorSessionFlowTypes";

interface UseEditorRealtimeRecoveryOptions {
  editor: EditorSessionFlowState;
  events: WsEvent[];
  refreshDraft: (leaseId?: string | null) => Promise<unknown>;
  setLockConflictNotice: (conflictTerminalId?: string | null) => void;
  showEditorNotice: (input: EditorNoticeState) => void;
  terminalId?: string | null;
}

export function useEditorRealtimeRecovery({
  editor,
  events,
  refreshDraft,
  setLockConflictNotice,
  showEditorNotice,
  terminalId,
}: UseEditorRealtimeRecoveryOptions) {
  const handledRealtimeEventIdRef = useRef<string | null>(null);

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
      applyLockedByOther(
        takeoverEvent.payload.new_lease_id,
        takeoverEvent.payload.new_terminal_id,
      );
      setLockConflictNotice(takeoverEvent.payload.new_terminal_id);
      refreshDraftWithNotice(takeoverEvent.payload.new_lease_id);
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
        applyLockedByOther(
          correlatedTakeoverEvent.payload.new_lease_id,
          correlatedTakeoverEvent.payload.new_terminal_id,
        );
        setLockConflictNotice(correlatedTakeoverEvent.payload.new_terminal_id);
        refreshDraftWithNotice(correlatedTakeoverEvent.payload.new_lease_id);
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
      refreshDraftWithNotice();
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

    function applyLockedByOther(leaseId: string | null, terminalIdValue: string | null) {
      appStore.setEditorSession({
        lockStatus: "LOCKED_BY_OTHER",
        leaseId,
        leaseExpiresAt: null,
        heartbeatIntervalSeconds: null,
        lockedByTerminalId: terminalIdValue,
      });
      appStore.setEditorDraftData({
        draft: editor.draft,
        draftVersion: editor.draftVersion,
        baseLayoutVersion: editor.baseLayoutVersion,
        readonly: true,
        lockStatus: "LOCKED_BY_OTHER",
      });
    }

    function refreshDraftWithNotice(leaseId?: string | null) {
      void refreshDraft(leaseId).catch((error) => {
        showEditorNotice({
          tone: "error",
          title: "刷新草稿失败",
          detail: normalizeApiError(error).message,
          actions: ["refresh"],
        });
      });
    }
  }, [
    editor.baseLayoutVersion,
    editor.draft,
    editor.draftVersion,
    events,
    refreshDraft,
    setLockConflictNotice,
    showEditorNotice,
    terminalId,
  ]);
}
