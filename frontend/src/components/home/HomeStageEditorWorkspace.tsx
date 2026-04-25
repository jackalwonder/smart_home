import { DeviceListItemDto } from "../../api/types";
import { BottomStatsStrip } from "../../components/home/BottomStatsStrip";
import { PageFrame } from "../../components/layout/PageFrame";
import { HomeMetricViewModel } from "../../view-models/home";
import { EditorCanvasWorkspace } from "../editor/EditorCanvasWorkspace";
import { HomeStageEditorNotice } from "./HomeStageEditorNotice";
import { HomeStageEditorSidebar } from "./HomeStageEditorSidebar";
import { HomeStageEditorToolbar } from "./HomeStageEditorToolbar";
import { useHomeStageEditorSession } from "./useHomeStageEditorSession";
import { useHomeStageHotspotEditing } from "./useHomeStageHotspotEditing";
import { useAppStore } from "../../store/useAppStore";

interface HomeStageEditorWorkspaceProps {
  devices: DeviceListItemDto[];
  stats: HomeMetricViewModel[];
  onApplied: () => Promise<void> | void;
  onExit: () => void;
  onOpenAdvancedSettings: () => void;
}

export function HomeStageEditorWorkspace({
  devices,
  stats,
  onApplied,
  onExit,
  onOpenAdvancedSettings,
}: HomeStageEditorWorkspaceProps) {
  const pin = useAppStore((state) => state.pin);
  const {
    canEdit,
    draftResetKey,
    draftState,
    handleApplyChanges,
    handleExitEditor,
    handleOpenAdvancedSettings,
    hasUnsavedChanges,
    isApplying,
    isLoading,
    isSaving,
    notice,
    setDraftState,
  } = useHomeStageEditorSession({
    onApplied,
    onExit,
    onOpenAdvancedSettings,
    pinActive: pin.active,
  });
  const {
    addDeviceHotspot,
    addHotspot,
    canvasMode,
    deleteSelectedHotspot,
    deviceSearch,
    filteredUnplacedDevices,
    historyState,
    moveHotspot,
    moveHotspots,
    nudgeSelectedHotspot,
    redoChange,
    replaceSelection,
    selectHotspot,
    selectedHotspot,
    selectedHotspotId,
    setCanvasMode,
    setDeviceSearch,
    setSelectedHotspotField,
    toggleSelectedVisibility,
    undoChange,
  } = useHomeStageHotspotEditing({
    canEdit,
    devices,
    draftResetKey,
    draftState,
    setDraftState,
  });

  return (
    <section className="page page--home home-stage-editor">
      {notice ? (
        <HomeStageEditorNotice
          notice={notice}
          onExitEditor={handleExitEditor}
          onOpenAdvancedSettings={handleOpenAdvancedSettings}
        />
      ) : null}

      <PageFrame
        aside={
          <HomeStageEditorSidebar
            canEdit={canEdit}
            deviceSearch={deviceSearch}
            filteredUnplacedDevices={filteredUnplacedDevices}
            onAddDeviceHotspot={addDeviceHotspot}
            onDeleteSelectedHotspot={deleteSelectedHotspot}
            onDeviceSearchChange={setDeviceSearch}
            onNudgeSelectedHotspot={nudgeSelectedHotspot}
            onSelectedHotspotFieldChange={setSelectedHotspotField}
            onToggleSelectedVisibility={toggleSelectedVisibility}
            selectedHotspot={selectedHotspot}
          />
        }
        className="page-frame--home"
        footer={<BottomStatsStrip stats={stats} />}
      >
        <div className="home-stage-editor__main">
          <HomeStageEditorToolbar
            canEdit={canEdit}
            hasUnsavedChanges={hasUnsavedChanges}
            historyState={historyState}
            isApplying={isApplying}
            isLoading={isLoading}
            isSaving={isSaving}
            onAddHotspot={addHotspot}
            onApplyChanges={handleApplyChanges}
            onExitEditor={handleExitEditor}
            onOpenAdvancedSettings={handleOpenAdvancedSettings}
            onRedoChange={redoChange}
            onUndoChange={undoChange}
          />

          {isLoading ? (
            <section className="panel home-stage-editor__loading">
              <strong>正在准备首页轻编辑…</strong>
              <p className="muted-copy">正在申请轻编辑锁并加载当前首页草稿。</p>
            </section>
          ) : (
            <EditorCanvasWorkspace
              batchSelectedHotspotIds={[]}
              backgroundImageSize={draftState.backgroundImageSize}
              backgroundImageUrl={draftState.backgroundImageUrl}
              canEdit={canEdit}
              hotspots={draftState.hotspots}
              mode={canvasMode}
              onBackgroundImageSizeChange={(backgroundImageSize) =>
                setDraftState((current) => ({
                  ...current,
                  backgroundImageSize,
                }))
              }
              onModeChange={setCanvasMode}
              onMoveHotspot={moveHotspot}
              onMoveHotspots={moveHotspots}
              onReplaceBatchSelection={replaceSelection}
              onSelectHotspot={selectHotspot}
              selectedHotspotId={selectedHotspotId}
            />
          )}
        </div>
      </PageFrame>
    </section>
  );
}
