import { DeviceListItemDto } from "../../api/types";
import { deriveHotspotIconKey } from "../../utils/hotspotIcons";
import { EditorHotspotViewModel } from "../../view-models/editor";
import {
  resequenceHotspots,
  sortHotspots,
  type EditorDraftState,
  type EditorDraftStateUpdater,
} from "../editorDraftState";
import { type EditorNoticeState } from "../editorWorkbenchNotices";
import {
  buildDeviceHotspotId,
  getNextHotspotPosition,
} from "./editorHotspotEditingHelpers";

export type EditorHotspotField =
  | "label"
  | "deviceId"
  | "iconType"
  | "labelMode"
  | "x"
  | "y"
  | "structureOrder";

interface UseEditorHotspotCommandsOptions {
  canEdit: boolean;
  clearBatchSelection: () => void;
  deviceCatalog: DeviceListItemDto[];
  draftState: EditorDraftState;
  selectedHotspot: EditorHotspotViewModel | null;
  selectedHotspotId: string | null;
  setBatchSelectedHotspotIds: (
    updater: (current: string[]) => string[],
  ) => void;
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
