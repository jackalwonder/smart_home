import { useMemo, useState } from "react";
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
import {
  buildDeviceHotspotId,
  getNextHotspotPosition,
} from "./editorHotspotEditingHelpers";
import { useEditorHotspotBatchEditing } from "./useEditorHotspotBatchEditing";
import { useEditorHotspotCanvasEditing } from "./useEditorHotspotCanvasEditing";
import { useEditorHotspotSelection } from "./useEditorHotspotSelection";
import { useEditorHotspotShortcuts } from "./useEditorHotspotShortcuts";

type EditorHotspotField =
  | "label"
  | "deviceId"
  | "iconType"
  | "labelMode"
  | "x"
  | "y"
  | "structureOrder";

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
  const {
    alignBatchHotspots,
    distributeBatchHotspots,
    distributeBatchHotspotsByStep,
    setBatchIconType,
    setBatchLabelMode,
    setBatchPosition,
    setBatchVisibility,
  } = useEditorHotspotBatchEditing({
    batchSelectedHotspotIds,
    canEdit,
    updateDraftStateWithHistory,
  });
  const { handleCanvasHotspotPointer, selectAllVisibleHotspots } =
    useEditorHotspotSelection({
      replaceBatchSelection,
      selectSingleHotspot,
      setSelectedHotspotId,
      toggleBatchHotspot,
      visibleHotspots,
    });
  const { moveHotspot, moveHotspotGroup, nudgeSelectedHotspot } =
    useEditorHotspotCanvasEditing({
      batchSelectedHotspotIds,
      canEdit,
      selectedHotspotId,
      setSelectedHotspotId,
      updateDraftStateWithHistory,
    });

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

  useEditorHotspotShortcuts({
    batchSelectedHotspotIds,
    canEdit,
    canRedo,
    canUndo,
    clearBatchSelection,
    draftHotspots: draftState.hotspots,
    historyState,
    isPublishingDraft,
    isSavingDraft,
    onDeleteSelectedHotspot: deleteSelectedHotspot,
    onDuplicateSelectedHotspot: duplicateSelectedHotspot,
    onNudgeSelectedHotspot: nudgeSelectedHotspot,
    onPublishDraft,
    onRedoDraftChange: handleRedoDraftChange,
    onSaveDraft,
    onSelectAllVisibleHotspots: selectAllVisibleHotspots,
    onUndoDraftChange: handleUndoDraftChange,
    selectedHotspotId,
    visibleHotspots,
  });

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
