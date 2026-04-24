import { sortHotspots, type EditorDraftStateUpdater } from "../editorDraftState";
import type { EditorHotspotViewModel } from "../../view-models/editor";
import { clampPosition } from "./editorHotspotEditingHelpers";

export type EditorBulkAlignAction =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "centerX"
  | "centerY";
export type EditorBulkDistributeAction = "horizontal" | "vertical";

interface UseEditorHotspotBatchEditingOptions {
  batchSelectedHotspotIds: string[];
  canEdit: boolean;
  updateDraftStateWithHistory: (
    updater: EditorDraftStateUpdater,
    label: string,
    groupKey?: string,
  ) => void;
}

export function useEditorHotspotBatchEditing({
  batchSelectedHotspotIds,
  canEdit,
  updateDraftStateWithHistory,
}: UseEditorHotspotBatchEditingOptions) {
  function updateBatchHotspots(
    updater: (
      hotspot: EditorHotspotViewModel,
      selected: EditorHotspotViewModel[],
    ) => EditorHotspotViewModel,
    label = "批量编辑热点",
  ) {
    if (!canEdit || !batchSelectedHotspotIds.length) {
      return;
    }

    const selectedSet = new Set(batchSelectedHotspotIds);
    updateDraftStateWithHistory((current) => {
      const selected = sortHotspots(
        current.hotspots.filter((hotspot) => selectedSet.has(hotspot.id)),
      );
      if (!selected.length) {
        return current;
      }

      return {
        ...current,
        hotspots: current.hotspots.map((hotspot) =>
          selectedSet.has(hotspot.id) ? updater(hotspot, selected) : hotspot,
        ),
      };
    }, label);
  }

  function alignBatchHotspots(action: EditorBulkAlignAction) {
    updateBatchHotspots((hotspot, selected) => {
      if (selected.length < 2) {
        return hotspot;
      }
      const xValues = selected.map((item) => item.x);
      const yValues = selected.map((item) => item.y);
      const targetX =
        action === "left"
          ? Math.min(...xValues)
          : action === "right"
            ? Math.max(...xValues)
            : action === "centerX"
              ? xValues.reduce((total, value) => total + value, 0) / xValues.length
              : hotspot.x;
      const targetY =
        action === "top"
          ? Math.min(...yValues)
          : action === "bottom"
            ? Math.max(...yValues)
            : action === "centerY"
              ? yValues.reduce((total, value) => total + value, 0) / yValues.length
              : hotspot.y;
      return {
        ...hotspot,
        x: clampPosition(targetX),
        y: clampPosition(targetY),
      };
    }, "批量对齐热点");
  }

  function distributeBatchHotspots(action: EditorBulkDistributeAction) {
    if (!canEdit || batchSelectedHotspotIds.length < 3) {
      return;
    }

    const selectedSet = new Set(batchSelectedHotspotIds);
    updateDraftStateWithHistory((current) => {
      const selected = current.hotspots
        .filter((hotspot) => selectedSet.has(hotspot.id))
        .sort((left, right) =>
          action === "horizontal" ? left.x - right.x : left.y - right.y,
        );
      if (selected.length < 3) {
        return current;
      }

      const first = action === "horizontal" ? selected[0].x : selected[0].y;
      const last =
        action === "horizontal"
          ? selected[selected.length - 1].x
          : selected[selected.length - 1].y;
      const step = (last - first) / (selected.length - 1);
      const targetById = new Map(
        selected.map((hotspot, index) => [
          hotspot.id,
          clampPosition(first + step * index),
        ]),
      );

      return {
        ...current,
        hotspots: current.hotspots.map((hotspot) => {
          const target = targetById.get(hotspot.id);
          if (target === undefined) {
            return hotspot;
          }
          return action === "horizontal"
            ? { ...hotspot, x: target }
            : { ...hotspot, y: target };
        }),
      };
    }, "批量等距分布");
  }

  function setBatchPosition(axis: "x" | "y", value: string) {
    const next = Number(value);
    if (!Number.isFinite(next)) {
      return;
    }
    const position = clampPosition(next / 100);
    updateBatchHotspots((hotspot) => ({ ...hotspot, [axis]: position }), "批量设置坐标");
  }

  function distributeBatchHotspotsByStep(axis: "x" | "y", value: string) {
    const stepValue = Number(value);
    if (
      !Number.isFinite(stepValue) ||
      stepValue <= 0 ||
      batchSelectedHotspotIds.length < 2
    ) {
      return;
    }

    const step = stepValue / 100;
    const selectedSet = new Set(batchSelectedHotspotIds);
    updateDraftStateWithHistory((current) => {
      const selected = current.hotspots
        .filter((hotspot) => selectedSet.has(hotspot.id))
        .sort((left, right) => left[axis] - right[axis]);
      if (selected.length < 2) {
        return current;
      }

      const start = selected[0][axis];
      const targetById = new Map(
        selected.map((hotspot, index) => [
          hotspot.id,
          clampPosition(start + step * index),
        ]),
      );
      return {
        ...current,
        hotspots: current.hotspots.map((hotspot) => {
          const target = targetById.get(hotspot.id);
          return target === undefined ? hotspot : { ...hotspot, [axis]: target };
        }),
      };
    }, "按数值分布热点");
  }

  function setBatchVisibility(visible: boolean) {
    updateBatchHotspots((hotspot) => ({ ...hotspot, isVisible: visible }), "批量切换显示");
  }

  function setBatchIconType(iconType: string) {
    updateBatchHotspots((hotspot) => ({ ...hotspot, iconType }), "批量设置图标");
  }

  function setBatchLabelMode(labelMode: string) {
    updateBatchHotspots((hotspot) => ({ ...hotspot, labelMode }), "批量设置标签模式");
  }

  return {
    alignBatchHotspots,
    distributeBatchHotspots,
    distributeBatchHotspotsByStep,
    setBatchIconType,
    setBatchLabelMode,
    setBatchPosition,
    setBatchVisibility,
  };
}
