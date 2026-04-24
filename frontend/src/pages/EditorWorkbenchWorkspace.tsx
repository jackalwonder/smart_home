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
  resequenceHotspots,
  sortHotspots,
  type EditorDraftState,
} from "../editor/editorDraftState";
import { useEditorDraftState } from "../editor/hooks/useEditorDraftState";
import { useEditorSessionFlow } from "../editor/hooks/useEditorSessionFlow";
import { appStore, useAppStore } from "../store/useAppStore";
import { mapEditorViewModel } from "../view-models/editor";
import { EditorHotspotViewModel } from "../view-models/editor";
import { deriveHotspotIconKey } from "../utils/hotspotIcons";
import { hasImageSize, type ImageSize } from "../types/image";

type EditorHotspotField =
  | "label"
  | "deviceId"
  | "iconType"
  | "labelMode"
  | "x"
  | "y"
  | "structureOrder";

type EditorBulkAlignAction = "left" | "right" | "top" | "bottom" | "centerX" | "centerY";
type EditorBulkDistributeAction = "horizontal" | "vertical";

interface EditorPublishSummaryItem {
  label: string;
  value: string;
  count?: number;
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

function isTextEditingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
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
  const [searchValue, setSearchValue] = useState("");
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

  const visibleHotspots = sortHotspots(
    draftState.hotspots.filter((hotspot) =>
      `${hotspot.label} ${hotspot.deviceId}`.toLowerCase().includes(searchValue.trim().toLowerCase()),
    ),
  );
  const placedDeviceIds = new Set(
    draftState.hotspots
      .map((hotspot) => hotspot.deviceId.trim())
      .filter((deviceId) => deviceId.length > 0),
  );
  const unplacedDevices = deviceCatalog.filter((device) => !placedDeviceIds.has(device.device_id));
  const selectedHotspot =
    visibleHotspots.find((hotspot) => hotspot.id === selectedHotspotId) ??
    draftState.hotspots.find((hotspot) => hotspot.id === selectedHotspotId) ??
    null;
  const selectedBatchHotspots = sortHotspots(
    draftState.hotspots.filter((hotspot) => batchSelectedHotspotIds.includes(hotspot.id)),
  );
  const localPublishSummary = buildLocalPublishSummary(draftState, publishBaseline);
  const effectivePublishSummary =
    publishSummary.totalChanges > 0 ? publishSummary : localPublishSummary;
  const effectivePublishSummaryError =
    effectivePublishSummary.totalChanges > 0 ? null : publishSummaryError;
  const effectivePublishSummaryLoading =
    publishSummaryLoading && effectivePublishSummary.totalChanges === 0;
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

  function updateHotspotField(
    field: EditorHotspotField,
    value: string,
  ) {
    if (!selectedHotspotId) {
      return;
    }

    updateDraftStateWithHistory((current) => {
      const nextHotspots = current.hotspots.map((hotspot) => {
        if (hotspot.id !== selectedHotspotId) {
          return hotspot;
        }

        if (field === "x" || field === "y") {
          const next = Math.min(Math.max(Number(value) / 100, 0), 1);
          return { ...hotspot, [field]: Number.isFinite(next) ? next : hotspot[field] };
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
          return { ...hotspot, deviceId: value, label: device?.display_name ?? hotspot.label };
        }

        if (field === "iconType") {
          return { ...hotspot, iconType: value, iconAssetId: null, iconAssetUrl: null };
        }

        return { ...hotspot, [field]: value };
      });

      return {
        ...current,
        hotspots:
          field === "structureOrder" ? resequenceHotspots(nextHotspots) : nextHotspots,
      };
    }, "修改热点属性", field === "label" || field === "deviceId" ? `field-${field}` : undefined);
  }

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

  function clearSelectedHotspotIconAsset() {
    if (!canEdit || !selectedHotspotId) {
      return;
    }
    updateDraftStateWithHistory((current) => ({
      ...current,
      hotspots: current.hotspots.map((hotspot) =>
        hotspot.id === selectedHotspotId
          ? { ...hotspot, iconAssetId: null, iconAssetUrl: null }
          : hotspot,
      ),
    }), "Clear hotspot icon");
  }

  function handleClearBackground() {
    if (!canEdit) {
      return;
    }

    updateDraftStateWithHistory((current) => ({
      ...current,
      backgroundAssetId: null,
      backgroundImageUrl: null,
      backgroundImageSize: null,
    }), "清除背景图");
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

    updateDraftStateWithHistory((current) => ({
      ...current,
      hotspots: current.hotspots.map((hotspot) =>
        hotspot.id === selectedHotspotId ? { ...hotspot, isVisible: visible } : hotspot,
      ),
    }), "切换热点显示");
  }

  function updateBatchHotspots(
    updater: (hotspot: EditorHotspotViewModel, selected: EditorHotspotViewModel[]) => EditorHotspotViewModel,
    label = "批量编辑热点",
  ) {
    if (!canEdit || !batchSelectedHotspotIds.length) {
      return;
    }

    const selectedSet = new Set(batchSelectedHotspotIds);
    updateDraftStateWithHistory((current) => {
      const selected = sortHotspots(current.hotspots.filter((hotspot) => selectedSet.has(hotspot.id)));
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
        .sort((left, right) => (action === "horizontal" ? left.x - right.x : left.y - right.y));
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
        selected.map((hotspot, index) => [hotspot.id, clampPosition(first + step * index)]),
      );

      return {
        ...current,
        hotspots: current.hotspots.map((hotspot) => {
          const target = targetById.get(hotspot.id);
          if (target === undefined) {
            return hotspot;
          }
          return action === "horizontal" ? { ...hotspot, x: target } : { ...hotspot, y: target };
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
    if (!Number.isFinite(stepValue) || stepValue <= 0 || batchSelectedHotspotIds.length < 2) {
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
        selected.map((hotspot, index) => [hotspot.id, clampPosition(start + step * index)]),
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
    updateDraftStateWithHistory((current) => ({
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
    }), "移动热点", "nudge-hotspots");
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

    updateDraftStateWithHistory((current) => ({
      ...current,
      hotspots: resequenceHotspots([...current.hotspots, duplicatedHotspot]),
    }), "复制热点");
    setSelectedHotspotId(duplicatedHotspot.id);
    clearBatchSelection();
  }

  function moveHotspot(hotspotId: string, x: number, y: number) {
    if (!canEdit) {
      return;
    }

    setSelectedHotspotId(hotspotId);
    updateDraftStateWithHistory((current) => ({
      ...current,
      hotspots: current.hotspots.map((hotspot) =>
        hotspot.id === hotspotId ? { ...hotspot, x, y } : hotspot,
      ),
    }), "拖动热点", "drag-hotspots");
  }

  function moveHotspotGroup(updates: Array<{ hotspotId: string; x: number; y: number }>) {
    if (!canEdit || !updates.length) {
      return;
    }

    const updatesById = new Map(
      updates.map((update) => [update.hotspotId, { x: update.x, y: update.y }]),
    );
    updateDraftStateWithHistory((current) => ({
      ...current,
      hotspots: current.hotspots.map((hotspot) => {
        const next = updatesById.get(hotspot.id);
        return next ? { ...hotspot, x: next.x, y: next.y } : hotspot;
      }),
    }), "拖动热点", "drag-hotspots");
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

    updateDraftStateWithHistory((current) => ({
      ...current,
      hotspots: resequenceHotspots([...current.hotspots, newHotspot]),
    }), "新增热点");
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

    updateDraftStateWithHistory((current) => ({
      ...current,
      hotspots: resequenceHotspots([...current.hotspots, newHotspot]),
    }), "添加设备热点");
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
    updateDraftStateWithHistory((current) => {
      const nextHotspots = resequenceHotspots(
        current.hotspots.filter((hotspot) => hotspot.id !== deletedHotspotId),
      );
      return {
        ...current,
        hotspots: nextHotspots,
      };
    }, "删除热点");
    setSelectedHotspotId((current) => (current === deletedHotspotId ? null : current));
    setBatchSelectedHotspotIds((current) =>
      current.filter((hotspotId) => hotspotId !== deletedHotspotId),
    );
  }

  function moveSelectedHotspot(direction: "up" | "down") {
    if (!selectedHotspotId || !canEdit) {
      return;
    }

    updateDraftStateWithHistory((current) => {
      const ordered = sortHotspots(current.hotspots);
      const currentIndex = ordered.findIndex((hotspot) => hotspot.id === selectedHotspotId);
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
        hotspots: next.map((hotspot, index) => ({ ...hotspot, structureOrder: index })),
      };
    }, "调整热点排序");
  }

  useEffect(() => {
    function handleEditorShortcut(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      const hasCommandModifier = event.metaKey || event.ctrlKey;
      const isTyping = isTextEditingTarget(event.target);

      if (hasCommandModifier && key === "s") {
        event.preventDefault();
        if (canEdit && !isSavingDraft) {
          void handleSaveDraft();
        }
        return;
      }

      if (isTyping) {
        return;
      }

      if (hasCommandModifier && key === "enter") {
        event.preventDefault();
        if (canEdit && !isPublishingDraft) {
          void handlePublishDraft();
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

  const orderedHotspots = sortHotspots(draftState.hotspots);
  const selectedHotspotIndex = selectedHotspot
    ? orderedHotspots.findIndex((hotspot) => hotspot.id === selectedHotspot.id)
    : -1;

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
