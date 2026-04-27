import { DeviceListItemDto } from "../../api/types";
import { EditorHotspotViewModel } from "../../view-models/editor";
import {
  resequenceHotspots,
  sortHotspots,
  type EditorDraftState,
  type EditorDraftStateUpdater,
} from "../editorDraftState";
import { type EditorNoticeState } from "../editorWorkbenchNotices";
import {
  applyHotspotFieldUpdate,
  buildDeviceHotspot,
  buildDuplicatedHotspot,
  buildEmptyHotspot,
  type EditorHotspotField,
} from "./editorHotspotEditingHelpers";

export type { EditorHotspotField };

interface UseEditorHotspotCommandsOptions {
  canEdit: boolean;
  clearBatchSelection: () => void;
  deviceCatalog: DeviceListItemDto[];
  draftState: EditorDraftState;
  selectedHotspot: EditorHotspotViewModel | null;
  selectedHotspotId: string | null;
  setBatchSelectedHotspotIds: (updater: (current: string[]) => string[]) => void;
  setSelectedHotspotId: (
    value: string | null | ((current: string | null) => string | null),
  ) => void;
  showEditorNotice: (notice: EditorNoticeState) => void;
  updateDraftStateWithHistory: (
    updater: EditorDraftStateUpdater,
    label: string,
    groupKey?: string,
  ) => void;
}

export function useEditorHotspotCommands({
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
}: UseEditorHotspotCommandsOptions) {
  function updateHotspotField(field: EditorHotspotField, value: string) {
    if (!selectedHotspotId) {
      return;
    }

    updateDraftStateWithHistory(
      (current) => ({
        ...current,
        hotspots:
          field === "structureOrder"
            ? resequenceHotspots(
                current.hotspots.map((hotspot) =>
                  hotspot.id === selectedHotspotId
                    ? applyHotspotFieldUpdate(hotspot, field, value, deviceCatalog)
                    : hotspot,
                ),
              )
            : current.hotspots.map((hotspot) =>
                hotspot.id === selectedHotspotId
                  ? applyHotspotFieldUpdate(hotspot, field, value, deviceCatalog)
                  : hotspot,
              ),
      }),
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
          hotspot.id === selectedHotspotId ? { ...hotspot, isVisible: visible } : hotspot,
        ),
      }),
      "切换热点显示",
    );
  }

  function duplicateSelectedHotspot() {
    if (!selectedHotspot || !canEdit) {
      return;
    }

    const order = draftState.hotspots.length + 1;
    const duplicatedHotspot = buildDuplicatedHotspot(selectedHotspot, order);

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

    const order = draftState.hotspots.length + 1;
    const newHotspot = buildEmptyHotspot(order);

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

    const order = draftState.hotspots.length + 1;
    const newHotspot = buildDeviceHotspot(device, order);

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
        hotspots: next.map((hotspot, index) => ({
          ...hotspot,
          structureOrder: index,
        })),
      };
    }, "调整热点排序");
  }

  return {
    addDeviceHotspot,
    addHotspot,
    clearSelectedHotspotIconAsset,
    deleteSelectedHotspot,
    duplicateSelectedHotspot,
    handleClearBackground,
    moveSelectedHotspot,
    updateHotspotField,
    updateHotspotVisibility,
  };
}
