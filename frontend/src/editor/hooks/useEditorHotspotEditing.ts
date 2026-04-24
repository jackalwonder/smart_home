import { useEffect, useMemo, useState } from "react";
import { DeviceListItemDto } from "../../api/types";
import {
  resequenceHotspots,
  sortHotspots,
  type EditorDraftState,
  type EditorDraftStateUpdater,
} from "../editorDraftState";
import { type EditorNoticeState } from "../editorWorkbenchNotices";
import { EditorHotspotViewModel } from "../../view-models/editor";
import { deriveHotspotIconKey } from "../../utils/hotspotIcons";

type EditorHotspotField =
  | "label"
  | "deviceId"
  | "iconType"
  | "labelMode"
  | "x"
  | "y"
  | "structureOrder";

type EditorBulkAlignAction =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "centerX"
  | "centerY";
type EditorBulkDistributeAction = "horizontal" | "vertical";

interface UseEditorHotspotEditingOptions {
  batchSelectedHotspotIds: string[];
  canEdit: boolean;
  canRedo: boolean;
  canUndo: boolean;
  clearBatchSelection: () => void;
  deviceCatalog: DeviceListItemDto[];
  draftState: EditorDraftState;
  historyState: { lastAction: string | null };
  isPublishingDraft: boolean;
  isSavingDraft: boolean;
  onPublishDraft: () => void;
  onSaveDraft: () => void;
  redoDraftChange: () => string | null;
  replaceBatchSelection: (hotspotIds: string[]) => void;
  selectedHotspotId: string | null;
  selectSingleHotspot: (
    hotspotId: string,
    options?: { keepBatch?: boolean },
  ) => void;
  setBatchSelectedHotspotIds: (
    updater: (current: string[]) => string[],
  ) => void;
  setDraftState: (updater: EditorDraftStateUpdater) => void;
  setSelectedHotspotId: (
    value: string | null | ((current: string | null) => string | null),
  ) => void;
  showEditorNotice: (notice: EditorNoticeState) => void;
  toggleBatchHotspot: (hotspotId: string) => void;
  undoDraftChange: () => string | null;
  updateDraftStateWithHistory: (
    updater: EditorDraftStateUpdater,
    label: string,
    groupKey?: string,
  ) => void;
}

function buildDeviceHotspotId(deviceId: string) {
  const normalized = deviceId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48);
  return `draft-device-${normalized}-${Date.now()}`;
}

function getNextHotspotPosition(index: number) {
  const column = index % 4;
  const row = Math.floor(index / 4);
  return {
    x: Math.min(0.2 + column * 0.2, 0.8),
    y: Math.min(0.25 + row * 0.16, 0.85),
  };
}

function clampPosition(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function isTextEditingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export function useEditorHotspotEditing({
  batchSelectedHotspotIds,
  canEdit,
  canRedo,
  canUndo,
  clearBatchSelection,
  deviceCatalog,
  draftState,
  historyState,
  isPublishingDraft,
  isSavingDraft,
  onPublishDraft,
  onSaveDraft,
  redoDraftChange,
  replaceBatchSelection,
  selectedHotspotId,
  selectSingleHotspot,
  setBatchSelectedHotspotIds,
  setDraftState,
  setSelectedHotspotId,
  showEditorNotice,
  toggleBatchHotspot,
  undoDraftChange,
  updateDraftStateWithHistory,
}: UseEditorHotspotEditingOptions) {
  const [searchValue, setSearchValue] = useState("");
  const visibleHotspots = useMemo(
    () =>
      sortHotspots(
        draftState.hotspots.filter((hotspot) =>
          `${hotspot.label} ${hotspot.deviceId}`
            .toLowerCase()
            .includes(searchValue.trim().toLowerCase()),
        ),
      ),
    [draftState.hotspots, searchValue],
  );
  const placedDeviceIds = useMemo(
    () =>
      new Set(
        draftState.hotspots
          .map((hotspot) => hotspot.deviceId.trim())
          .filter((deviceId) => deviceId.length > 0),
      ),
    [draftState.hotspots],
  );
  const unplacedDevices = useMemo(
    () => deviceCatalog.filter((device) => !placedDeviceIds.has(device.device_id)),
    [deviceCatalog, placedDeviceIds],
  );
  const selectedHotspot =
    visibleHotspots.find((hotspot) => hotspot.id === selectedHotspotId) ??
    draftState.hotspots.find((hotspot) => hotspot.id === selectedHotspotId) ??
    null;
  const selectedBatchHotspots = sortHotspots(
    draftState.hotspots.filter((hotspot) =>
      batchSelectedHotspotIds.includes(hotspot.id),
    ),
  );
  const orderedHotspots = sortHotspots(draftState.hotspots);
  const selectedHotspotIndex = selectedHotspot
    ? orderedHotspots.findIndex((hotspot) => hotspot.id === selectedHotspot.id)
    : -1;

  function handleCanvasHotspotPointer(
    hotspotId: string,
    options?: { toggleBatch?: boolean; preserveBatch?: boolean },
  ) {
    if (options?.toggleBatch) {
      toggleBatchHotspot(hotspotId);
      setSelectedHotspotId(hotspotId);
      return;
    }
    selectSingleHotspot(hotspotId, { keepBatch: options?.preserveBatch });
  }

  function selectAllVisibleHotspots() {
    replaceBatchSelection(visibleHotspots.map((hotspot) => hotspot.id));
  }

  function handleUndoDraftChange() {
    const label = undoDraftChange();
    if (!label) {
      return;
    }
    showEditorNotice({
      tone: "success",
      title: "已撤销",
      detail: `已恢复到“${label}”之前的草稿状态。`,
    });
  }

  function handleRedoDraftChange() {
    const label = redoDraftChange();
    if (!label) {
      return;
    }
    showEditorNotice({
      tone: "success",
      title: "已重做",
      detail: `已重新应用“${label}”。`,
    });
  }

  function updateHotspotField(field: EditorHotspotField, value: string) {
    if (!selectedHotspotId) {
      return;
    }

    updateDraftStateWithHistory(
      (current) => {
        const nextHotspots = current.hotspots.map((hotspot) => {
          if (hotspot.id !== selectedHotspotId) {
            return hotspot;
          }

          if (field === "x" || field === "y") {
            const next = Math.min(Math.max(Number(value) / 100, 0), 1);
            return {
              ...hotspot,
              [field]: Number.isFinite(next) ? next : hotspot[field],
            };
          }

          if (field === "structureOrder") {
            const next = Number(value);
            return {
              ...hotspot,
              structureOrder: Number.isFinite(next)
                ? Math.max(0, Math.round(next))
                : hotspot.structureOrder,
            };
          }

          if (field === "label") {
            return { ...hotspot, label: value };
          }

          if (field === "deviceId") {
            const device = deviceCatalog.find((item) => item.device_id === value);
            return {
              ...hotspot,
              deviceId: value,
              label: device?.display_name ?? hotspot.label,
            };
          }

          if (field === "iconType") {
            return {
              ...hotspot,
              iconType: value,
              iconAssetId: null,
              iconAssetUrl: null,
            };
          }

          return { ...hotspot, [field]: value };
        });

        return {
          ...current,
          hotspots:
            field === "structureOrder"
              ? resequenceHotspots(nextHotspots)
              : nextHotspots,
        };
      },
      "修改热点属性",
      field === "label" || field === "deviceId" ? `field-${field}` : undefined,
    );
  }

  function clearSelectedHotspotIconAsset() {
    if (!canEdit || !selectedHotspotId) {
      return;
    }
    updateDraftStateWithHistory(
      (current) => ({
        ...current,
        hotspots: current.hotspots.map((hotspot) =>
          hotspot.id === selectedHotspotId
            ? { ...hotspot, iconAssetId: null, iconAssetUrl: null }
            : hotspot,
        ),
      }),
      "Clear hotspot icon",
    );
  }

  function handleClearBackground() {
    if (!canEdit) {
      return;
    }

    updateDraftStateWithHistory(
      (current) => ({
        ...current,
        backgroundAssetId: null,
        backgroundImageUrl: null,
        backgroundImageSize: null,
      }),
      "清除背景图",
    );
    showEditorNotice({
      tone: "success",
      title: "背景图已清除",
      detail: "当前草稿已切回默认户型底图。保存草稿后会写入后端，发布后进入首页布局。",
    });
  }

  function updateHotspotVisibility(visible: boolean) {
    if (!selectedHotspotId) {
      return;
    }

    updateDraftStateWithHistory(
      (current) => ({
        ...current,
        hotspots: current.hotspots.map((hotspot) =>
          hotspot.id === selectedHotspotId
            ? { ...hotspot, isVisible: visible }
            : hotspot,
        ),
      }),
      "切换热点显示",
    );
  }

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

  function nudgeSelectedHotspot(
    direction: "left" | "right" | "up" | "down",
    delta = 0.01,
  ) {
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
            x: Math.min(Math.max(hotspot.x + xDelta, 0), 1),
            y: Math.min(Math.max(hotspot.y + yDelta, 0), 1),
          };
        }),
      }),
      "移动热点",
      "nudge-hotspots",
    );
  }

  function duplicateSelectedHotspot() {
    if (!selectedHotspot || !canEdit) {
      return;
    }

    const duplicatedHotspot: EditorHotspotViewModel = {
      ...selectedHotspot,
      id: `${selectedHotspot.id}-copy-${Date.now()}`,
      label: `${selectedHotspot.label} 副本`,
      x: Math.min(selectedHotspot.x + 0.04, 1),
      y: Math.min(selectedHotspot.y + 0.04, 1),
      structureOrder: draftState.hotspots.length,
    };

    updateDraftStateWithHistory(
      (current) => ({
        ...current,
        hotspots: resequenceHotspots([...current.hotspots, duplicatedHotspot]),
      }),
      "复制热点",
    );
    setSelectedHotspotId(duplicatedHotspot.id);
    clearBatchSelection();
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

  function moveHotspotGroup(
    updates: Array<{ hotspotId: string; x: number; y: number }>,
  ) {
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

  function addHotspot() {
    if (!canEdit) {
      return;
    }

    const newHotspot: EditorHotspotViewModel = {
      id: `draft-hotspot-${Date.now()}`,
      label: `热点 ${draftState.hotspots.length + 1}`,
      deviceId: "",
      x: 0.5,
      y: 0.5,
      iconType: "device",
      iconAssetId: null,
      iconAssetUrl: null,
      labelMode: "AUTO",
      isVisible: true,
      structureOrder: draftState.hotspots.length,
    };

    updateDraftStateWithHistory(
      (current) => ({
        ...current,
        hotspots: resequenceHotspots([...current.hotspots, newHotspot]),
      }),
      "新增热点",
    );
    setSelectedHotspotId(newHotspot.id);
    clearBatchSelection();
  }

  function addDeviceHotspot(device: DeviceListItemDto) {
    if (!canEdit) {
      return;
    }

    const existingHotspot = draftState.hotspots.find(
      (hotspot) => hotspot.deviceId.trim() === device.device_id,
    );
    if (existingHotspot) {
      setSelectedHotspotId(existingHotspot.id);
      return;
    }

    const position = getNextHotspotPosition(draftState.hotspots.length);
    const newHotspot: EditorHotspotViewModel = {
      id: buildDeviceHotspotId(device.device_id),
      label: device.display_name,
      deviceId: device.device_id,
      x: position.x,
      y: position.y,
      iconType: deriveHotspotIconKey(device.device_type, device.device_type),
      iconAssetId: null,
      iconAssetUrl: null,
      labelMode: "AUTO",
      isVisible: true,
      structureOrder: draftState.hotspots.length,
    };

    updateDraftStateWithHistory(
      (current) => ({
        ...current,
        hotspots: resequenceHotspots([...current.hotspots, newHotspot]),
      }),
      "添加设备热点",
    );
    setSelectedHotspotId(newHotspot.id);
    clearBatchSelection();
    showEditorNotice({
      tone: "success",
      title: "草稿已更新",
      detail: "设备已加入当前草稿。保存草稿后会写入后端，发布后进入首页布局。",
    });
  }

  function deleteSelectedHotspot() {
    if (!selectedHotspotId || !canEdit) {
      return;
    }

    const deletedHotspotId = selectedHotspotId;
    updateDraftStateWithHistory(
      (current) => {
        const nextHotspots = resequenceHotspots(
          current.hotspots.filter((hotspot) => hotspot.id !== deletedHotspotId),
        );
        return {
          ...current,
          hotspots: nextHotspots,
        };
      },
      "删除热点",
    );
    setSelectedHotspotId((current) =>
      current === deletedHotspotId ? null : current,
    );
    setBatchSelectedHotspotIds((current) =>
      current.filter((hotspotId) => hotspotId !== deletedHotspotId),
    );
  }

  function moveSelectedHotspot(direction: "up" | "down") {
    if (!selectedHotspotId || !canEdit) {
      return;
    }

    updateDraftStateWithHistory(
      (current) => {
        const ordered = sortHotspots(current.hotspots);
        const currentIndex = ordered.findIndex(
          (hotspot) => hotspot.id === selectedHotspotId,
        );
        if (currentIndex === -1) {
          return current;
        }

        const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
        if (targetIndex < 0 || targetIndex >= ordered.length) {
          return current;
        }

        const next = [...ordered];
        const [moved] = next.splice(currentIndex, 1);
        next.splice(targetIndex, 0, moved);

        return {
          ...current,
          hotspots: next.map((hotspot, index) => ({
            ...hotspot,
            structureOrder: index,
          })),
        };
      },
      "调整热点排序",
    );
  }

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
          handleRedoDraftChange();
        } else {
          handleUndoDraftChange();
        }
        return;
      }

      if (hasCommandModifier && key === "y") {
        event.preventDefault();
        handleRedoDraftChange();
        return;
      }

      if (hasCommandModifier && key === "a") {
        event.preventDefault();
        selectAllVisibleHotspots();
        return;
      }

      if (hasCommandModifier && key === "d") {
        event.preventDefault();
        duplicateSelectedHotspot();
        return;
      }

      if (key === "escape") {
        clearBatchSelection();
        return;
      }

      if (key === "delete" || key === "backspace") {
        if (selectedHotspotId) {
          event.preventDefault();
          deleteSelectedHotspot();
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
        nudgeSelectedHotspot(direction, delta);
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
    draftState,
    historyState,
    isPublishingDraft,
    isSavingDraft,
    selectedHotspotId,
    visibleHotspots,
  ]);

  return {
    addDeviceHotspot,
    addHotspot,
    alignBatchHotspots,
    clearSelectedHotspotIconAsset,
    deleteSelectedHotspot,
    distributeBatchHotspots,
    distributeBatchHotspotsByStep,
    duplicateSelectedHotspot,
    handleCanvasHotspotPointer,
    handleClearBackground,
    handleRedoDraftChange,
    handleUndoDraftChange,
    moveHotspot,
    moveHotspotGroup,
    moveSelectedHotspot,
    nudgeSelectedHotspot,
    orderedHotspots,
    searchValue,
    selectedBatchHotspots,
    selectedHotspot,
    selectedHotspotIndex,
    selectAllVisibleHotspots,
    setBatchIconType,
    setBatchLabelMode,
    setBatchPosition,
    setBatchVisibility,
    setSearchValue,
    unplacedDevices,
    updateHotspotField,
    updateHotspotVisibility,
    visibleHotspots,
  };
}
