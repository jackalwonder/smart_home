import { useEffect, useState } from "react";
import { EditorCanvasWorkspace } from "../components/editor/EditorCanvasWorkspace";
import { EditorCommandBar } from "../components/editor/EditorCommandBar";
import { EditorInspector } from "../components/editor/EditorInspector";
import { EditorPublishSummary } from "../components/editor/EditorPublishSummary";
import { EditorRealtimeFeed } from "../components/editor/EditorRealtimeFeed";
import { EditorToolbox } from "../components/editor/EditorToolbox";
import { previewEditorDraftDiff } from "../api/editorApi";
import { fetchDevices } from "../api/devicesApi";
import { normalizeApiError } from "../api/httpClient";
import { uploadFloorplanAsset, uploadHotspotIconAsset } from "../api/pageAssetsApi";
import { DeviceListItemDto, EditorDraftDiffDto } from "../api/types";
import { type EditorNoticeAction } from "../editor/editorWorkbenchNotices";
import {
  areEditorDraftStatesEqual,
  buildDraftDiffInput,
  parseLayoutMetaText,
  type EditorDraftState,
} from "../editor/editorDraftState";
import { useEditorDraftState } from "../editor/hooks/useEditorDraftState";
import { useEditorHotspotEditing } from "../editor/hooks/useEditorHotspotEditing";
import { useEditorSessionFlow } from "../editor/hooks/useEditorSessionFlow";
import { appStore, useAppStore } from "../store/useAppStore";
import { mapEditorViewModel } from "../view-models/editor";
import { EditorHotspotViewModel } from "../view-models/editor";
import { hasImageSize, type ImageSize } from "../types/image";

interface EditorPublishSummaryItem {
  label: string;
  value: string;
  count?: number;
}

function normalizeImageSize(value: {
  width?: number | null;
  height?: number | null;
} | null | undefined): ImageSize | null {
  if (!value) {
    return null;
  }

  const normalized: ImageSize = {
    width: value.width ?? null,
    height: value.height ?? null,
  };
  return hasImageSize(normalized) ? normalized : null;
}

function mapPublishSummary(diff: EditorDraftDiffDto): {
  items: EditorPublishSummaryItem[];
  totalChanges: number;
} {
  return {
    totalChanges: diff.total_changes ?? 0,
    items: (diff.items ?? []).map((item) => ({
      label: item.label ?? "-",
      value: item.summary ?? "-",
      count: item.count ?? undefined,
    })),
  };
}

function parseLayoutMetaTextSafe(value: string) {
  try {
    return parseLayoutMetaText(value);
  } catch {
    return {};
  }
}

function normalizeForComparison(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeForComparison);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== "hotspot_labels")
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalizeForComparison(item)]),
    );
  }
  return value;
}

function formatHotspotList(hotspots: EditorHotspotViewModel[]) {
  const names = hotspots.slice(0, 3).map((hotspot) => hotspot.label || hotspot.id);
  return hotspots.length > 3 ? `${names.join("、")} 等 ${hotspots.length} 个` : names.join("、");
}

function buildLocalPublishSummary(
  current: EditorDraftState,
  baseline: EditorDraftState | null,
): { items: EditorPublishSummaryItem[]; totalChanges: number } {
  if (!baseline) {
    return { items: [], totalChanges: 0 };
  }

  const currentById = new Map(current.hotspots.map((hotspot) => [hotspot.id, hotspot]));
  const baselineById = new Map(baseline.hotspots.map((hotspot) => [hotspot.id, hotspot]));
  const added = current.hotspots.filter((hotspot) => !baselineById.has(hotspot.id));
  const removed = baseline.hotspots.filter((hotspot) => !currentById.has(hotspot.id));
  const moved: EditorHotspotViewModel[] = [];
  const relabeled: EditorHotspotViewModel[] = [];
  const rebound: EditorHotspotViewModel[] = [];
  const restyled: EditorHotspotViewModel[] = [];
  const reordered: EditorHotspotViewModel[] = [];

  for (const hotspot of current.hotspots) {
    const previous = baselineById.get(hotspot.id);
    if (!previous) {
      continue;
    }
    if (Math.abs(hotspot.x - previous.x) > 0.0005 || Math.abs(hotspot.y - previous.y) > 0.0005) {
      moved.push(hotspot);
    }
    if (hotspot.label !== previous.label) {
      relabeled.push(hotspot);
    }
    if (hotspot.deviceId !== previous.deviceId) {
      rebound.push(hotspot);
    }
    if (
      hotspot.iconType !== previous.iconType ||
      hotspot.iconAssetId !== previous.iconAssetId ||
      hotspot.labelMode !== previous.labelMode ||
      hotspot.isVisible !== previous.isVisible
    ) {
      restyled.push(hotspot);
    }
    if (hotspot.structureOrder !== previous.structureOrder) {
      reordered.push(hotspot);
    }
  }

  const items: EditorPublishSummaryItem[] = [];
  const groups: Array<[string, EditorHotspotViewModel[]]> = [
    ["新增热点", added],
    ["移除热点", removed],
    ["位置调整", moved],
    ["名称更新", relabeled],
    ["设备绑定更新", rebound],
    ["展示样式更新", restyled],
    ["排序更新", reordered],
  ];
  let totalChanges = 0;
  for (const [label, hotspots] of groups) {
    if (!hotspots.length) {
      continue;
    }
    items.push({
      label,
      value: formatHotspotList(hotspots),
      count: hotspots.length,
    });
    totalChanges += hotspots.length;
  }

  if (current.backgroundAssetId !== baseline.backgroundAssetId) {
    items.push({
      label: "背景图更新",
      value: current.backgroundAssetId ? "已设置或替换背景图" : "已清除背景图",
      count: 1,
    });
    totalChanges += 1;
  }

  if (
    JSON.stringify(normalizeForComparison(parseLayoutMetaTextSafe(current.layoutMetaText))) !==
    JSON.stringify(normalizeForComparison(parseLayoutMetaTextSafe(baseline.layoutMetaText)))
  ) {
    items.push({
      label: "布局元数据更新",
      value: "JSON 元数据已修改",
      count: 1,
    });
    totalChanges += 1;
  }

  return { items, totalChanges };
}

interface EditorWorkbenchWorkspaceProps {
  embedded?: boolean;
}

export function EditorWorkbenchWorkspace({
  embedded = false,
}: EditorWorkbenchWorkspaceProps) {
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
  const [publishSummary, setPublishSummary] = useState<{
    items: EditorPublishSummaryItem[];
    totalChanges: number;
  }>({ items: [], totalChanges: 0 });
  const [publishSummaryLoading, setPublishSummaryLoading] = useState(false);
  const [publishSummaryError, setPublishSummaryError] = useState<string | null>(null);
  const [deviceCatalog, setDeviceCatalog] = useState<DeviceListItemDto[]>([]);
  const [deviceCatalogLoading, setDeviceCatalogLoading] = useState(false);
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
    setDraftState,
    setSelectedHotspotId,
    showEditorNotice,
    toggleBatchHotspot,
    undoDraftChange,
    updateDraftStateWithHistory,
  });
  const [isUploadingBackground, setIsUploadingBackground] = useState(false);
  const [isUploadingHotspotIcon, setIsUploadingHotspotIcon] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      setDeviceCatalogLoading(true);
      try {
        const catalog = await fetchDevices({ page: 1, page_size: 200 });
        if (!active) {
          return;
        }
        setDeviceCatalog(catalog.items);
      } catch (error) {
        if (!active) {
          return;
        }
        appStore.setEditorError(normalizeApiError(error).message);
      } finally {
        if (active) {
          setDeviceCatalogLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    let timer = 0;

    timer = window.setTimeout(() => {
      void (async () => {
        try {
          const diffInput = buildDraftDiffInput(draftState, editor.baseLayoutVersion);
          if (!active) {
            return;
          }
          setPublishSummaryLoading(true);
          setPublishSummaryError(null);
          const diff = await previewEditorDraftDiff(diffInput);
          if (!active) {
            return;
          }
          setPublishSummary(mapPublishSummary(diff));
        } catch (error) {
          if (!active) {
            return;
          }
          setPublishSummary({ items: [], totalChanges: 0 });
          setPublishSummaryError(
            error instanceof SyntaxError
              ? "布局元数据暂时不可解析，发布前摘要不可用。"
              : "暂时无法读取后端发布摘要，请稍后重试。",
          );
        } finally {
          if (active) {
            setPublishSummaryLoading(false);
          }
        }
      })();
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [draftState, editor.baseLayoutVersion]);

  const localPublishSummary = buildLocalPublishSummary(draftState, publishBaseline);
  const effectivePublishSummary =
    publishSummary.totalChanges > 0 ? publishSummary : localPublishSummary;
  const effectivePublishSummaryError =
    effectivePublishSummary.totalChanges > 0 ? null : publishSummaryError;
  const effectivePublishSummaryLoading =
    publishSummaryLoading && effectivePublishSummary.totalChanges === 0;

  async function handleUploadBackground(file: File) {
    if (!canEdit) {
      return;
    }

    clearEditorFeedback();
    setIsUploadingBackground(true);
    try {
      const uploaded = await uploadFloorplanAsset({ file, replaceCurrent: false });
      updateDraftStateWithHistory((current) => ({
        ...current,
        backgroundAssetId: uploaded.asset_id,
        backgroundImageUrl: uploaded.background_image_url,
        backgroundImageSize: normalizeImageSize(uploaded.background_image_size),
      }), "更新背景图");
      showEditorNotice({
        tone: "success",
        title: "背景图已更新",
        detail: "图片已上传并应用到当前草稿。保存草稿后会写入后端，发布后进入首页布局。",
      });
    } catch (error) {
      await handleEditorActionError(error, "upload");
    } finally {
      setIsUploadingBackground(false);
    }
  }

  async function handleUploadHotspotIcon(file: File) {
    if (!canEdit || !selectedHotspotId) {
      return;
    }

    clearEditorFeedback();
    setIsUploadingHotspotIcon(true);
    try {
      const uploaded = await uploadHotspotIconAsset({ file });
      updateDraftStateWithHistory((current) => ({
        ...current,
        hotspots: current.hotspots.map((hotspot) =>
          hotspot.id === selectedHotspotId
            ? {
                ...hotspot,
                iconAssetId: uploaded.asset_id,
                iconAssetUrl: uploaded.icon_asset_url,
              }
            : hotspot,
        ),
      }), "Upload hotspot icon");
      showEditorNotice({
        tone: "success",
        title: "Hotspot icon uploaded",
        detail: "The custom icon is attached to the selected hotspot. Save and publish to use it on the home page.",
      });
    } catch (error) {
      await handleEditorActionError(error, "upload");
    } finally {
      setIsUploadingHotspotIcon(false);
    }
  }

  function renderNoticeAction(action: EditorNoticeAction) {
    switch (action) {
      case "refresh":
        return (
          <button className="button button--ghost" onClick={() => void refreshDraft()} type="button">
            刷新草稿
          </button>
        );
      case "retry-save":
        return (
          <button className="button button--primary" onClick={() => void handleSaveDraft()} type="button">
            重新保存
          </button>
        );
      case "retry-publish":
        return (
          <button className="button button--primary" onClick={() => void handlePublishDraft()} type="button">
            重新发布
          </button>
        );
      case "retry-acquire":
      case "acquire":
        return canAcquire ? (
          <button className="button button--ghost" onClick={() => void handleAcquireLock()} type="button">
            重新申请编辑
          </button>
        ) : null;
      case "retry-takeover":
      case "takeover":
        return canTakeover ? (
          <button className="button button--primary" onClick={() => void handleTakeover()} type="button">
            接管当前锁
          </button>
        ) : null;
      case "retry-discard":
        return (
          <button className="button button--ghost" onClick={() => void handleDiscardDraft()} type="button">
            重新丢弃
          </button>
        );
    }
  }

  return (
    <section
      className={embedded ? "editor-workspace-embedded" : "page page--editor"}
    >
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
              const sameWidth = current.backgroundImageSize?.width === backgroundImageSize.width;
              const sameHeight = current.backgroundImageSize?.height === backgroundImageSize.height;
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
          canMoveDown={selectedHotspotIndex > -1 && selectedHotspotIndex < orderedHotspots.length - 1}
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
