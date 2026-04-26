import { useState } from "react";
import { useEditorDraftState } from "../editor/hooks/useEditorDraftState";
import { useEditorHotspotEditing } from "../editor/hooks/useEditorHotspotEditing";
import { useEditorSessionFlow } from "../editor/hooks/useEditorSessionFlow";
import { useAppStore } from "../store/useAppStore";
import { mapEditorViewModel } from "../view-models/editor";
import { buildEditorWorkbenchProps } from "./editorWorkbenchProps";
import { useEditorAssetUploads } from "./useEditorAssetUploads";
import { useEditorDeviceCatalog } from "./useEditorDeviceCatalog";
import { useEditorPublishSummary } from "./useEditorPublishSummary";

export function useEditorWorkbenchController(embedded: boolean) {
  const session = useAppStore((state) => state.session);
  const editor = useAppStore((state) => state.editor);
  const pin = useAppStore((state) => state.pin);
  const events = useAppStore((state) => state.wsEvents);
  const terminalId = session.data?.terminalId;
  const pinSessionActive = session.data?.pinSessionActive ?? false;
  const viewModel = mapEditorViewModel({
    lockStatus: editor.lockStatus,
    leaseId: editor.leaseId,
    leaseExpiresAt: editor.leaseExpiresAt,
    heartbeatIntervalSeconds: editor.heartbeatIntervalSeconds,
    lockedByTerminalId: editor.lockedByTerminalId,
    draft: editor.draft,
    draftVersion: editor.draftVersion,
    baseLayoutVersion: editor.baseLayoutVersion,
    readonly: editor.readonly,
    pinActive: pin.active,
    events,
  });
  const canEdit = !editor.readonly && editor.lockStatus === "GRANTED";
  const [canvasMode, setCanvasMode] = useState<"edit" | "preview">("edit");
  const draft = useEditorDraftState({
    canEdit,
    draftSource: editor.draft,
    snapshot: {
      baseLayoutVersion: editor.baseLayoutVersion,
      draftVersion: editor.draftVersion,
      leaseId: editor.leaseId,
      lockStatus: editor.lockStatus,
    },
    viewModel,
  });
  const { deviceCatalog, deviceCatalogLoading } = useEditorDeviceCatalog();
  const sessionFlow = useEditorSessionFlow({
    canEdit,
    draftState: draft.draftState,
    editor,
    events,
    pinActive: pin.active,
    pinSessionActive,
    resetSelection: draft.resetSelection,
    terminalId,
  });
  const hotspotEditing = useEditorHotspotEditing({
    batchSelectedHotspotIds: draft.batchSelectedHotspotIds,
    canEdit,
    canRedo: draft.canRedo,
    canUndo: draft.canUndo,
    clearBatchSelection: draft.clearBatchSelection,
    deviceCatalog,
    draftState: draft.draftState,
    historyState: draft.historyState,
    isPublishingDraft: sessionFlow.isPublishingDraft,
    isSavingDraft: sessionFlow.isSavingDraft,
    onPublishDraft: () => void sessionFlow.handlePublishDraft(),
    onSaveDraft: () => void sessionFlow.handleSaveDraft(),
    redoDraftChange: draft.redoDraftChange,
    replaceBatchSelection: draft.replaceBatchSelection,
    selectedHotspotId: draft.selectedHotspotId,
    selectSingleHotspot: draft.selectSingleHotspot,
    setBatchSelectedHotspotIds: draft.setBatchSelectedHotspotIds,
    setSelectedHotspotId: draft.setSelectedHotspotId,
    showEditorNotice: sessionFlow.showEditorNotice,
    toggleBatchHotspot: draft.toggleBatchHotspot,
    undoDraftChange: draft.undoDraftChange,
    updateDraftStateWithHistory: draft.updateDraftStateWithHistory,
  });
  const publishSummary = useEditorPublishSummary(
    draft.draftState,
    draft.publishBaseline,
    editor.baseLayoutVersion,
  );
  const assetUploads = useEditorAssetUploads({
    canEdit,
    clearEditorFeedback: sessionFlow.clearEditorFeedback,
    handleEditorActionError: sessionFlow.handleEditorActionError,
    selectedHotspotId: draft.selectedHotspotId,
    showEditorNotice: sessionFlow.showEditorNotice,
    updateDraftStateWithHistory: draft.updateDraftStateWithHistory,
  });

  const props = buildEditorWorkbenchProps({
    commandBarProps: {
      acquireBusy: sessionFlow.isAcquiringLock,
      canAcquire: sessionFlow.canAcquire,
      canSave: canEdit,
      canPublish: canEdit,
      canRedo: draft.canRedo,
      canTakeover: sessionFlow.canTakeover,
      canUndo: draft.canUndo,
      canDiscard: sessionFlow.canDiscard,
      embedded,
      helperText: viewModel.helperText,
      historyLabel: draft.historyState.lastAction,
      hotspotCount: draft.draftState.hotspots.length,
      modeLabel: viewModel.modeLabel,
      onAddHotspot: hotspotEditing.addHotspot,
      onAcquire: () => void sessionFlow.handleAcquireLock(),
      onDiscardDraft: () => void sessionFlow.handleDiscardDraft(),
      onPublishDraft: () => void sessionFlow.handlePublishDraft(),
      onRedo: hotspotEditing.handleRedoDraftChange,
      onSaveDraft: () => void sessionFlow.handleSaveDraft(),
      onTakeover: () => void sessionFlow.handleTakeover(),
      onUndo: hotspotEditing.handleUndoDraftChange,
      discardBusy: sessionFlow.isDiscardingDraft,
      publishBusy: sessionFlow.isPublishingDraft,
      rows: viewModel.commandRows,
      saveBusy: sessionFlow.isSavingDraft,
      takeoverBusy: sessionFlow.isTakingOver,
    },
    publishSummaryProps: {
      errorMessage: publishSummary.effectivePublishSummaryError,
      isLoading: publishSummary.effectivePublishSummaryLoading,
      items: publishSummary.effectivePublishSummary.items,
      totalChanges: publishSummary.effectivePublishSummary.totalChanges,
    },
    toolboxProps: {
      batchSelectedHotspotIds: draft.batchSelectedHotspotIds,
      canEdit,
      devicesLoading: deviceCatalogLoading,
      hotspots: hotspotEditing.visibleHotspots,
      unplacedDevices: hotspotEditing.unplacedDevices,
      onAddDeviceHotspot: hotspotEditing.addDeviceHotspot,
      onClearBatchSelection: draft.clearBatchSelection,
      onSearchChange: hotspotEditing.setSearchValue,
      onSelectAllHotspots: hotspotEditing.selectAllVisibleHotspots,
      onSelectHotspot: draft.selectSingleHotspot,
      onToggleBatchHotspot: draft.toggleBatchHotspot,
      searchValue: hotspotEditing.searchValue,
      selectedHotspotId: draft.selectedHotspotId,
    },
    canvasProps: {
      batchSelectedHotspotIds: draft.batchSelectedHotspotIds,
      backgroundImageSize: draft.draftState.backgroundImageSize,
      backgroundImageUrl: draft.draftState.backgroundImageUrl,
      canEdit,
      hotspots: draft.draftState.hotspots,
      mode: canvasMode,
      onBackgroundImageSizeChange: (backgroundImageSize) => {
        draft.setDraftState((current) => {
          const sameWidth = current.backgroundImageSize?.width === backgroundImageSize.width;
          const sameHeight =
            current.backgroundImageSize?.height === backgroundImageSize.height;
          return sameWidth && sameHeight ? current : { ...current, backgroundImageSize };
        });
      },
      onModeChange: setCanvasMode,
      onMoveHotspot: hotspotEditing.moveHotspot,
      onMoveHotspots: hotspotEditing.moveHotspotGroup,
      onReplaceBatchSelection: draft.replaceBatchSelection,
      onSelectHotspot: hotspotEditing.handleCanvasHotspotPointer,
      selectedHotspotId: draft.selectedHotspotId,
    },
    inspectorProps: {
      batchHotspots: hotspotEditing.selectedBatchHotspots,
      backgroundAssetId: draft.draftState.backgroundAssetId,
      backgroundImageUrl: draft.draftState.backgroundImageUrl,
      canEdit,
      devices: deviceCatalog,
      hotspot: hotspotEditing.selectedHotspot,
      layoutMetaText: draft.draftState.layoutMetaText,
      canMoveDown:
        hotspotEditing.selectedHotspotIndex > -1 &&
        hotspotEditing.selectedHotspotIndex < hotspotEditing.orderedHotspots.length - 1,
      canMoveUp: hotspotEditing.selectedHotspotIndex > 0,
      isUploadingBackground: assetUploads.isUploadingBackground,
      isUploadingHotspotIcon: assetUploads.isUploadingHotspotIcon,
      onBulkAlign: hotspotEditing.alignBatchHotspots,
      onBulkDistribute: hotspotEditing.distributeBatchHotspots,
      onBulkDistributeByStep: hotspotEditing.distributeBatchHotspotsByStep,
      onBulkSetPosition: hotspotEditing.setBatchPosition,
      onBulkSetIconType: hotspotEditing.setBatchIconType,
      onBulkSetLabelMode: hotspotEditing.setBatchLabelMode,
      onBulkSetVisibility: hotspotEditing.setBatchVisibility,
      onChangeHotspot: hotspotEditing.updateHotspotField,
      onChangeLayoutMeta: (value) =>
        draft.updateDraftStateWithHistory(
          (current) => ({ ...current, layoutMetaText: value }),
          "修改布局元数据",
          "layout-meta",
        ),
      onClearBackground: hotspotEditing.handleClearBackground,
      onClearBatchSelection: draft.clearBatchSelection,
      onDeleteHotspot: hotspotEditing.deleteSelectedHotspot,
      onDuplicateHotspot: hotspotEditing.duplicateSelectedHotspot,
      onMoveHotspot: hotspotEditing.moveSelectedHotspot,
      onNudgeHotspot: hotspotEditing.nudgeSelectedHotspot,
      onUploadBackground: (file) => void assetUploads.handleUploadBackground(file),
      onUploadHotspotIcon: (file) => void assetUploads.handleUploadHotspotIcon(file),
      onClearHotspotIcon: hotspotEditing.clearSelectedHotspotIconAsset,
      onToggleVisibility: hotspotEditing.updateHotspotVisibility,
      rows: viewModel.commandRows,
    },
  });

  return {
    ...props,
    canAcquire: sessionFlow.canAcquire,
    canTakeover: sessionFlow.canTakeover,
    editorNotice: sessionFlow.editorNotice,
    eventRows: viewModel.eventRows,
    noticeActions: {
      acquire: () => void sessionFlow.handleAcquireLock(),
      discard: () => void sessionFlow.handleDiscardDraft(),
      publish: () => void sessionFlow.handlePublishDraft(),
      refresh: () => void sessionFlow.refreshDraft(),
      save: () => void sessionFlow.handleSaveDraft(),
      takeover: () => void sessionFlow.handleTakeover(),
    },
  };
}
