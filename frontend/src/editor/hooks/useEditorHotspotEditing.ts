import { useMemo, useState } from "react";
import { DeviceListItemDto } from "../../api/types";
import {
  sortHotspots,
  type EditorDraftState,
  type EditorDraftStateUpdater,
} from "../editorDraftState";
import { type EditorNoticeState } from "../editorWorkbenchNotices";
import { useEditorHotspotBatchEditing } from "./useEditorHotspotBatchEditing";
import { useEditorHotspotCanvasEditing } from "./useEditorHotspotCanvasEditing";
import { useEditorHotspotCommands } from "./useEditorHotspotCommands";
import { useEditorHotspotSelection } from "./useEditorHotspotSelection";
import { useEditorHotspotShortcuts } from "./useEditorHotspotShortcuts";

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
  selectSingleHotspot: (hotspotId: string, options?: { keepBatch?: boolean }) => void;
  setBatchSelectedHotspotIds: (updater: (current: string[]) => string[]) => void;
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
    draftState.hotspots.filter((hotspot) => batchSelectedHotspotIds.includes(hotspot.id)),
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
  const { handleCanvasHotspotPointer, selectAllVisibleHotspots } = useEditorHotspotSelection({
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

  const {
    addDeviceHotspot,
    addHotspot,
    clearSelectedHotspotIconAsset,
    deleteSelectedHotspot,
    duplicateSelectedHotspot,
    handleClearBackground,
    moveSelectedHotspot,
    updateHotspotField,
    updateHotspotVisibility,
  } = useEditorHotspotCommands({
    canEdit,
    clearBatchSelection,
    deviceCatalog,
    draftState,
    selectedHotspot,
    selectedHotspotId,
    setBatchSelectedHotspotIds,
    setSelectedHotspotId,
    showEditorNotice,
    updateDraftStateWithHistory,
  });

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
