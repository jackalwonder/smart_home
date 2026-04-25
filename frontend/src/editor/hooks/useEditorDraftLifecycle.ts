import { useState } from "react";
import { discardEditorDraft, saveEditorDraft } from "../../api/editorApi";
import type { EditorDraftDto } from "../../api/types";
import { appStore } from "../../store/useAppStore";
import {
  buildDraftHotspotInputs,
  buildLayoutMetaWithHotspotLabels,
  parseLayoutMetaText,
  type EditorDraftState,
} from "../editorDraftState";
import type { EditorActionKind, EditorNoticeState } from "../editorWorkbenchNotices";
import type { EditorSessionFlowState } from "./editorSessionFlowTypes";

interface UseEditorDraftLifecycleOptions {
  canEdit: boolean;
  draftState: EditorDraftState;
  editor: EditorSessionFlowState;
  clearEditorFeedback: () => void;
  handleEditorActionError: (error: unknown, action: EditorActionKind) => Promise<void>;
  refreshDraft: (leaseId?: string | null) => Promise<EditorDraftDto>;
  resetSelection: () => void;
  showEditorNotice: (input: EditorNoticeState) => void;
}

export function useEditorDraftLifecycle({
  canEdit,
  draftState,
  editor,
  clearEditorFeedback,
  handleEditorActionError,
  refreshDraft,
  resetSelection,
  showEditorNotice,
}: UseEditorDraftLifecycleOptions) {
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isDiscardingDraft, setIsDiscardingDraft] = useState(false);
  const canDiscard = canEdit && Boolean(editor.leaseId && editor.draftVersion);

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

  return {
    canDiscard,
    handleDiscardDraft,
    handleSaveDraft,
    isDiscardingDraft,
    isSavingDraft,
    persistDraft,
  };
}
