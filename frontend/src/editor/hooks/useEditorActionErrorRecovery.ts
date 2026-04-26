import { useCallback } from "react";
import { normalizeApiError } from "../../api/httpClient";
import type { EditorDraftDto } from "../../api/types";
import { appStore } from "../../store/useAppStore";
import {
  asDetailRecord,
  asDetailString,
  buildEditorErrorNotice,
  formatLockLostDetail,
  formatVersionConflictDetail,
  type EditorActionKind,
  type EditorNoticeState,
} from "../editorWorkbenchNotices";
import type { EditorSessionFlowState } from "./editorSessionFlowTypes";

interface UseEditorActionErrorRecoveryOptions {
  editor: EditorSessionFlowState;
  refreshDraft: (leaseId?: string | null) => Promise<EditorDraftDto>;
  showEditorNotice: (input: EditorNoticeState) => void;
}

export function useEditorActionErrorRecovery({
  editor,
  refreshDraft,
  showEditorNotice,
}: UseEditorActionErrorRecoveryOptions) {
  const handleEditorActionError = useCallback(
    async (error: unknown, action: EditorActionKind) => {
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
        const terminalMismatch =
          apiError.details?.reason === "TERMINAL_MISMATCH" &&
          activeLeaseId &&
          activeTerminalId;

        appStore.setEditorSession(
          terminalMismatch
            ? {
                lockStatus: "LOCKED_BY_OTHER",
                leaseId: activeLeaseId,
                leaseExpiresAt: asDetailString(activeLease?.lease_expires_at),
                heartbeatIntervalSeconds: editor.heartbeatIntervalSeconds,
                lockedByTerminalId: activeTerminalId,
              }
            : {
                lockStatus: "READ_ONLY",
                leaseId: null,
                leaseExpiresAt: null,
                heartbeatIntervalSeconds: null,
                lockedByTerminalId: null,
              },
        );

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
          actions: terminalMismatch ? ["refresh", "takeover"] : ["refresh", "acquire"],
        });
        return;
      }

      showEditorNotice(buildEditorErrorNotice(apiError, action));
    },
    [
      editor.heartbeatIntervalSeconds,
      editor.leaseId,
      editor.lockStatus,
      refreshDraft,
      showEditorNotice,
    ],
  );

  return { handleEditorActionError };
}
