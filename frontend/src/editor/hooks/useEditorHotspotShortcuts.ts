import { useEffect } from "react";
import type { EditorHotspotViewModel } from "../../view-models/editor";
import { isTextEditingTarget } from "./editorHotspotEditingHelpers";

interface UseEditorHotspotShortcutsOptions {
  batchSelectedHotspotIds: string[];
  canEdit: boolean;
  canRedo: boolean;
  canUndo: boolean;
  clearBatchSelection: () => void;
  draftHotspots: EditorHotspotViewModel[];
  historyState: { lastAction: string | null };
  isPublishingDraft: boolean;
  isSavingDraft: boolean;
  onDeleteSelectedHotspot: () => void;
  onDuplicateSelectedHotspot: () => void;
  onNudgeSelectedHotspot: (
    direction: "left" | "right" | "up" | "down",
    delta?: number,
  ) => void;
  onPublishDraft: () => void;
  onRedoDraftChange: () => void;
  onSaveDraft: () => void;
  onSelectAllVisibleHotspots: () => void;
  onUndoDraftChange: () => void;
  selectedHotspotId: string | null;
  visibleHotspots: EditorHotspotViewModel[];
}

export function useEditorHotspotShortcuts({
  batchSelectedHotspotIds,
  canEdit,
  canRedo,
  canUndo,
  clearBatchSelection,
  draftHotspots,
  historyState,
  isPublishingDraft,
  isSavingDraft,
  onDeleteSelectedHotspot,
  onDuplicateSelectedHotspot,
  onNudgeSelectedHotspot,
  onPublishDraft,
  onRedoDraftChange,
  onSaveDraft,
  onSelectAllVisibleHotspots,
  onUndoDraftChange,
  selectedHotspotId,
  visibleHotspots,
}: UseEditorHotspotShortcutsOptions) {
  useEffect(() => {
    function handleEditorShortcut(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      const hasCommandModifier = event.metaKey || event.ctrlKey;
      const isTyping = isTextEditingTarget(event.target);

      if (hasCommandModifier && key === "s") {
        event.preventDefault();
        if (canEdit && !isSavingDraft) {
          onSaveDraft();
        }
        return;
      }

      if (isTyping) {
        return;
      }

      if (hasCommandModifier && key === "enter") {
        event.preventDefault();
        if (canEdit && !isPublishingDraft) {
          onPublishDraft();
        }
        return;
      }

      if (hasCommandModifier && key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          onRedoDraftChange();
        } else {
          onUndoDraftChange();
        }
        return;
      }

      if (hasCommandModifier && key === "y") {
        event.preventDefault();
        onRedoDraftChange();
        return;
      }

      if (hasCommandModifier && key === "a") {
        event.preventDefault();
        onSelectAllVisibleHotspots();
        return;
      }

      if (hasCommandModifier && key === "d") {
        event.preventDefault();
        onDuplicateSelectedHotspot();
        return;
      }

      if (key === "escape") {
        clearBatchSelection();
        return;
      }

      if (key === "delete" || key === "backspace") {
        if (selectedHotspotId) {
          event.preventDefault();
          onDeleteSelectedHotspot();
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
        onNudgeSelectedHotspot(direction, delta);
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
    clearBatchSelection,
    draftHotspots,
    historyState,
    isPublishingDraft,
    isSavingDraft,
    onDeleteSelectedHotspot,
    onDuplicateSelectedHotspot,
    onNudgeSelectedHotspot,
    onPublishDraft,
    onRedoDraftChange,
    onSaveDraft,
    onSelectAllVisibleHotspots,
    onUndoDraftChange,
    selectedHotspotId,
    visibleHotspots,
  ]);
}
