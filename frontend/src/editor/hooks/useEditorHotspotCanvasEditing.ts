import type { EditorDraftStateUpdater } from "../editorDraftState";
import { clampPosition } from "./editorHotspotEditingHelpers";

interface UseEditorHotspotCanvasEditingOptions {
  batchSelectedHotspotIds: string[];
  canEdit: boolean;
  selectedHotspotId: string | null;
  setSelectedHotspotId: (
    value: string | null | ((current: string | null) => string | null),
  ) => void;
  updateDraftStateWithHistory: (
    updater: EditorDraftStateUpdater,
    label: string,
    groupKey?: string,
  ) => void;
}

export function useEditorHotspotCanvasEditing({
  batchSelectedHotspotIds,
  canEdit,
  selectedHotspotId,
  setSelectedHotspotId,
  updateDraftStateWithHistory,
}: UseEditorHotspotCanvasEditingOptions) {
  function nudgeSelectedHotspot(direction: "left" | "right" | "up" | "down", delta = 0.01) {
    const targetIds = batchSelectedHotspotIds.length
      ? batchSelectedHotspotIds
      : selectedHotspotId
        ? [selectedHotspotId]
        : [];
    if (!targetIds.length || !canEdit) {
      return;
    }

    const targetSet = new Set(targetIds);
    updateDraftStateWithHistory(
      (current) => ({
        ...current,
        hotspots: current.hotspots.map((hotspot) => {
          if (!targetSet.has(hotspot.id)) {
            return hotspot;
          }
          const xDelta = direction === "left" ? -delta : direction === "right" ? delta : 0;
          const yDelta = direction === "up" ? -delta : direction === "down" ? delta : 0;
          return {
            ...hotspot,
            x: clampPosition(hotspot.x + xDelta),
            y: clampPosition(hotspot.y + yDelta),
          };
        }),
      }),
      "移动热点",
      "nudge-hotspots",
    );
  }

  function moveHotspot(hotspotId: string, x: number, y: number) {
    if (!canEdit) {
      return;
    }

    setSelectedHotspotId(hotspotId);
    updateDraftStateWithHistory(
      (current) => ({
        ...current,
        hotspots: current.hotspots.map((hotspot) =>
          hotspot.id === hotspotId ? { ...hotspot, x, y } : hotspot,
        ),
      }),
      "拖动热点",
      "drag-hotspots",
    );
  }

  function moveHotspotGroup(updates: Array<{ hotspotId: string; x: number; y: number }>) {
    if (!canEdit || !updates.length) {
      return;
    }

    const updatesById = new Map(
      updates.map((update) => [update.hotspotId, { x: update.x, y: update.y }]),
    );
    updateDraftStateWithHistory(
      (current) => ({
        ...current,
        hotspots: current.hotspots.map((hotspot) => {
          const next = updatesById.get(hotspot.id);
          return next ? { ...hotspot, x: next.x, y: next.y } : hotspot;
        }),
      }),
      "拖动热点",
      "drag-hotspots",
    );
  }

  return {
    moveHotspot,
    moveHotspotGroup,
    nudgeSelectedHotspot,
  };
}
