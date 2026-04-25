import { useState } from "react";
import { publishEditorDraft } from "../../api/editorApi";
import { appStore } from "../../store/useAppStore";
import type { EditorActionKind, EditorNoticeState } from "../editorWorkbenchNotices";
import type { EditorSessionFlowState } from "./editorSessionFlowTypes";

interface UseEditorPublishFlowOptions {
  canEdit: boolean;
  editor: EditorSessionFlowState;
  clearEditorFeedback: () => void;
  handleEditorActionError: (error: unknown, action: EditorActionKind) => Promise<void>;
  persistDraft: (options?: {
    silent?: boolean;
    errorAction?: "save" | "publish";
  }) => Promise<{ draft_version?: string | null; base_layout_version?: string | null } | null>;
  refreshDraft: (leaseId?: string | null) => Promise<unknown>;
  resetSelection: () => void;
  showEditorNotice: (input: EditorNoticeState) => void;
}

export function useEditorPublishFlow({
  canEdit,
  editor,
  clearEditorFeedback,
  handleEditorActionError,
  persistDraft,
  refreshDraft,
  resetSelection,
  showEditorNotice,
}: UseEditorPublishFlowOptions) {
  const [isPublishingDraft, setIsPublishingDraft] = useState(false);

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

  return {
    handlePublishDraft,
    isPublishingDraft,
  };
}
