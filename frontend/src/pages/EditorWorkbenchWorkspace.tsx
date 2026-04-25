import { useState } from "react";
import { EditorCanvasWorkspace } from "../components/editor/EditorCanvasWorkspace";
import { EditorCommandBar } from "../components/editor/EditorCommandBar";
import { EditorInspector } from "../components/editor/EditorInspector";
import { EditorPublishSummary } from "../components/editor/EditorPublishSummary";
import { EditorRealtimeFeed } from "../components/editor/EditorRealtimeFeed";
import { EditorToolbox } from "../components/editor/EditorToolbox";
import { type EditorNoticeAction } from "../editor/editorWorkbenchNotices";
import { useEditorDraftState } from "../editor/hooks/useEditorDraftState";
import { useEditorHotspotEditing } from "../editor/hooks/useEditorHotspotEditing";
import { useEditorSessionFlow } from "../editor/hooks/useEditorSessionFlow";
import { useAppStore } from "../store/useAppStore";
import { mapEditorViewModel } from "../view-models/editor";
import { useEditorAssetUploads } from "./useEditorAssetUploads";
import { useEditorDeviceCatalog } from "./useEditorDeviceCatalog";
import { useEditorPublishSummary } from "./useEditorPublishSummary";

interface EditorWorkbenchWorkspaceProps {
  embedded?: boolean;
}

export function EditorWorkbenchWorkspace({ embedded = false }: EditorWorkbenchWorkspaceProps) {
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
  const {
    batchSelectedHotspotIds,
    canRedo,
    canUndo,
    clearBatchSelection,
    draftState,
    historyState,
    publishBaseline,
    redoDraftChange,
    replaceBatchSelection,
    resetSelection,
    selectedHotspotId,
    selectSingleHotspot,
    setBatchSelectedHotspotIds,
    setDraftState,
    setSelectedHotspotId,
    toggleBatchHotspot,
    undoDraftChange,
    updateDraftStateWithHistory,
  } = useEditorDraftState({
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
  const {
    canAcquire,
    canDiscard,
    canTakeover,
    clearEditorFeedback,
    editorNotice,
    handleAcquireLock,
    handleDiscardDraft,
    handleEditorActionError,
    handlePublishDraft,
    handleSaveDraft,
    handleTakeover,
    isAcquiringLock,
    isDiscardingDraft,
    isPublishingDraft,
    isSavingDraft,
    isTakingOver,
    refreshDraft,
    showEditorNotice,
  } = useEditorSessionFlow({
    canEdit,
    draftState,
    editor,
    events,
    pinActive: pin.active,
    pinSessionActive,
    resetSelection,
    terminalId,
  });
  const {
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
  } = useEditorHotspotEditing({
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
    onPublishDraft: () => void handlePublishDraft(),
    onSaveDraft: () => void handleSaveDraft(),
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
  });
  const {
    effectivePublishSummary,
    effectivePublishSummaryError,
    effectivePublishSummaryLoading,
  } = useEditorPublishSummary(draftState, publishBaseline, editor.baseLayoutVersion);
  const {
    handleUploadBackground,
    handleUploadHotspotIcon,
    isUploadingBackground,
    isUploadingHotspotIcon,
  } = useEditorAssetUploads({
    canEdit,
    clearEditorFeedback,
    handleEditorActionError,
    selectedHotspotId,
    showEditorNotice,
    updateDraftStateWithHistory,
  });

  function renderNoticeAction(action: EditorNoticeAction) {
    switch (action) {
      case "refresh":
        return (
          <button
            className="button button--ghost"
            onClick={() => void refreshDraft()}
            type="button"
          >
            刷新草稿
          </button>
        );
      case "retry-save":
        return (
          <button
            className="button button--primary"
            onClick={() => void handleSaveDraft()}
            type="button"
          >
            重新保存
          </button>
        );
      case "retry-publish":
        return (
          <button
            className="button button--primary"
            onClick={() => void handlePublishDraft()}
            type="button"
          >
            重新发布
          </button>
        );
      case "retry-acquire":
      case "acquire":
        return canAcquire ? (
          <button
            className="button button--ghost"
            onClick={() => void handleAcquireLock()}
            type="button"
          >
            重新申请编辑
          </button>
        ) : null;
      case "retry-takeover":
      case "takeover":
        return canTakeover ? (
          <button
            className="button button--primary"
            onClick={() => void handleTakeover()}
            type="button"
          >
            接管当前锁
          </button>
        ) : null;
      case "retry-discard":
        return (
          <button
            className="button button--ghost"
            onClick={() => void handleDiscardDraft()}
            type="button"
          >
            重新丢弃
          </button>
        );
    }
  }

  return (
    <section className={embedded ? "editor-workspace-embedded" : "page page--editor"}>
      {editorNotice ? (
        <section className={`editor-recovery editor-recovery--${editorNotice.tone}`}>
          <div>
            <strong>{editorNotice.title}</strong>
            <p>{editorNotice.detail}</p>
          </div>
          <div className="badge-row">
            {editorNotice.actions?.map((action) => (
              <span key={action}>{renderNoticeAction(action)}</span>
            ))}
          </div>
        </section>
      ) : null}
      <EditorCommandBar
        acquireBusy={isAcquiringLock}
        canAcquire={canAcquire}
        canSave={canEdit}
        canPublish={canEdit}
        canRedo={canRedo}
        canTakeover={canTakeover}
        canUndo={canUndo}
        canDiscard={canDiscard}
        embedded={embedded}
        helperText={viewModel.helperText}
        historyLabel={historyState.lastAction}
        hotspotCount={draftState.hotspots.length}
        modeLabel={viewModel.modeLabel}
        onAddHotspot={addHotspot}
        onAcquire={() => void handleAcquireLock()}
        onDiscardDraft={() => void handleDiscardDraft()}
        onPublishDraft={() => void handlePublishDraft()}
        onRedo={handleRedoDraftChange}
        onSaveDraft={() => void handleSaveDraft()}
        onTakeover={() => void handleTakeover()}
        onUndo={handleUndoDraftChange}
        discardBusy={isDiscardingDraft}
        publishBusy={isPublishingDraft}
        rows={viewModel.commandRows}
        saveBusy={isSavingDraft}
        takeoverBusy={isTakingOver}
      />
      <EditorPublishSummary
        errorMessage={effectivePublishSummaryError}
        isLoading={effectivePublishSummaryLoading}
        items={effectivePublishSummary.items}
        totalChanges={effectivePublishSummary.totalChanges}
      />
      <div className="editor-workbench">
        <EditorToolbox
          batchSelectedHotspotIds={batchSelectedHotspotIds}
          canEdit={canEdit}
          devicesLoading={deviceCatalogLoading}
          hotspots={visibleHotspots}
          unplacedDevices={unplacedDevices}
          onAddDeviceHotspot={addDeviceHotspot}
          onClearBatchSelection={clearBatchSelection}
          onSearchChange={setSearchValue}
          onSelectAllHotspots={selectAllVisibleHotspots}
          onSelectHotspot={selectSingleHotspot}
          onToggleBatchHotspot={toggleBatchHotspot}
          searchValue={searchValue}
          selectedHotspotId={selectedHotspotId}
        />
        <EditorCanvasWorkspace
          batchSelectedHotspotIds={batchSelectedHotspotIds}
          backgroundImageSize={draftState.backgroundImageSize}
          backgroundImageUrl={draftState.backgroundImageUrl}
          canEdit={canEdit}
          hotspots={draftState.hotspots}
          mode={canvasMode}
          onBackgroundImageSizeChange={(backgroundImageSize) => {
            setDraftState((current) => {
              const sameWidth =
                current.backgroundImageSize?.width === backgroundImageSize.width;
              const sameHeight =
                current.backgroundImageSize?.height === backgroundImageSize.height;
              return sameWidth && sameHeight
                ? current
                : {
                    ...current,
                    backgroundImageSize,
                  };
            });
          }}
          onModeChange={setCanvasMode}
          onMoveHotspot={moveHotspot}
          onMoveHotspots={moveHotspotGroup}
          onReplaceBatchSelection={replaceBatchSelection}
          onSelectHotspot={handleCanvasHotspotPointer}
          selectedHotspotId={selectedHotspotId}
        />
        <EditorInspector
          batchHotspots={selectedBatchHotspots}
          backgroundAssetId={draftState.backgroundAssetId}
          backgroundImageUrl={draftState.backgroundImageUrl}
          canEdit={canEdit}
          devices={deviceCatalog}
          hotspot={selectedHotspot}
          layoutMetaText={draftState.layoutMetaText}
          canMoveDown={
            selectedHotspotIndex > -1 && selectedHotspotIndex < orderedHotspots.length - 1
          }
          canMoveUp={selectedHotspotIndex > 0}
          isUploadingBackground={isUploadingBackground}
          isUploadingHotspotIcon={isUploadingHotspotIcon}
          onBulkAlign={alignBatchHotspots}
          onBulkDistribute={distributeBatchHotspots}
          onBulkDistributeByStep={distributeBatchHotspotsByStep}
          onBulkSetPosition={setBatchPosition}
          onBulkSetIconType={setBatchIconType}
          onBulkSetLabelMode={setBatchLabelMode}
          onBulkSetVisibility={setBatchVisibility}
          onChangeHotspot={updateHotspotField}
          onChangeLayoutMeta={(value) =>
            updateDraftStateWithHistory(
              (current) => ({ ...current, layoutMetaText: value }),
              "修改布局元数据",
              "layout-meta",
            )
          }
          onClearBackground={handleClearBackground}
          onClearBatchSelection={clearBatchSelection}
          onDeleteHotspot={deleteSelectedHotspot}
          onDuplicateHotspot={duplicateSelectedHotspot}
          onMoveHotspot={moveSelectedHotspot}
          onNudgeHotspot={nudgeSelectedHotspot}
          onUploadBackground={(file) => void handleUploadBackground(file)}
          onUploadHotspotIcon={(file) => void handleUploadHotspotIcon(file)}
          onClearHotspotIcon={clearSelectedHotspotIconAsset}
          onToggleVisibility={updateHotspotVisibility}
          rows={viewModel.commandRows}
        />
      </div>
      <EditorRealtimeFeed rows={viewModel.eventRows} />
    </section>
  );
}
