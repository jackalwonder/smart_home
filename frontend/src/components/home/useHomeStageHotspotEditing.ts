import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { DeviceListItemDto } from "../../api/types";
import {
  areEditorDraftStatesEqual,
  cloneEditorDraftState,
  resequenceHotspots,
  type EditorDraftState,
} from "../../editor/editorDraftState";
import {
  buildPlacedDeviceIds,
  clampPosition,
  createDeviceHotspot,
  createNewHotspot,
  filterUnplacedDevices,
  type EditorHistoryEntry,
} from "./homeStageEditorModel";

interface UseHomeStageHotspotEditingOptions {
  canEdit: boolean;
  devices: DeviceListItemDto[];
  draftResetKey: number;
  draftState: EditorDraftState;
  setDraftState: Dispatch<SetStateAction<EditorDraftState>>;
}

export function useHomeStageHotspotEditing({
  canEdit,
  devices,
  draftResetKey,
  draftState,
  setDraftState,
}: UseHomeStageHotspotEditingOptions) {
  const undoStackRef = useRef<EditorHistoryEntry[]>([]);
  const redoStackRef = useRef<EditorHistoryEntry[]>([]);
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null);
  const [canvasMode, setCanvasMode] = useState<"edit" | "preview">("edit");
  const [deviceSearch, setDeviceSearch] = useState("");
  const [historyState, setHistoryState] = useState({
    undoCount: 0,
    redoCount: 0,
  });

  const selectedHotspot =
    draftState.hotspots.find((hotspot) => hotspot.id === selectedHotspotId) ?? null;
  const placedDeviceIds = useMemo(
    () => buildPlacedDeviceIds(draftState.hotspots),
    [draftState.hotspots],
  );
  const filteredUnplacedDevices = useMemo(
    () => filterUnplacedDevices(devices, placedDeviceIds, deviceSearch),
    [deviceSearch, devices, placedDeviceIds],
  );

  function syncHistoryState() {
    setHistoryState({
      undoCount: undoStackRef.current.length,
      redoCount: redoStackRef.current.length,
    });
  }

  useEffect(() => {
    setSelectedHotspotId(draftState.hotspots[0]?.id ?? null);
    undoStackRef.current = [];
    redoStackRef.current = [];
    syncHistoryState();
  }, [draftResetKey]);

  function pushHistory(current: EditorDraftState) {
    undoStackRef.current = [
      ...undoStackRef.current,
      {
        draft: cloneEditorDraftState(current),
        selectedHotspotId,
      },
    ].slice(-30);
    redoStackRef.current = [];
    syncHistoryState();
  }

  function updateDraft(
    updater: (current: EditorDraftState) => EditorDraftState,
  ) {
    if (!canEdit) {
      return;
    }

    setDraftState((current) => {
      const next = updater(current);
      if (areEditorDraftStatesEqual(current, next)) {
        return current;
      }
      pushHistory(current);
      return next;
    });
  }

  function undoChange() {
    if (!canEdit || !undoStackRef.current.length) {
      return;
    }
    const previous = undoStackRef.current[undoStackRef.current.length - 1];
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    redoStackRef.current = [
      ...redoStackRef.current,
      {
        draft: cloneEditorDraftState(draftState),
        selectedHotspotId,
      },
    ].slice(-30);
    setDraftState(cloneEditorDraftState(previous.draft));
    setSelectedHotspotId(previous.selectedHotspotId);
    syncHistoryState();
  }

  function redoChange() {
    if (!canEdit || !redoStackRef.current.length) {
      return;
    }
    const nextEntry = redoStackRef.current[redoStackRef.current.length - 1];
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    undoStackRef.current = [
      ...undoStackRef.current,
      {
        draft: cloneEditorDraftState(draftState),
        selectedHotspotId,
      },
    ].slice(-30);
    setDraftState(cloneEditorDraftState(nextEntry.draft));
    setSelectedHotspotId(nextEntry.selectedHotspotId);
    syncHistoryState();
  }

  function setSelectedHotspotField(
    field: "label" | "iconType" | "labelMode",
    value: string,
  ) {
    if (!selectedHotspot) {
      return;
    }
    updateDraft((current) => ({
      ...current,
      hotspots: current.hotspots.map((hotspot) =>
        hotspot.id === selectedHotspot.id ? { ...hotspot, [field]: value } : hotspot,
      ),
    }));
  }

  function toggleSelectedVisibility(visible: boolean) {
    if (!selectedHotspot) {
      return;
    }
    updateDraft((current) => ({
      ...current,
      hotspots: current.hotspots.map((hotspot) =>
        hotspot.id === selectedHotspot.id ? { ...hotspot, isVisible: visible } : hotspot,
      ),
    }));
  }

  function addHotspot() {
    const nextHotspot = createNewHotspot(draftState.hotspots.length);
    updateDraft((current) => ({
      ...current,
      hotspots: [...current.hotspots, nextHotspot],
    }));
    setSelectedHotspotId(nextHotspot.id);
  }

  function addDeviceHotspot(device: DeviceListItemDto) {
    updateDraft((current) => {
      const nextHotspot = createDeviceHotspot(device, current.hotspots.length);
      setSelectedHotspotId(nextHotspot.id);
      return {
        ...current,
        hotspots: [...current.hotspots, nextHotspot],
      };
    });
  }

  function deleteSelectedHotspot() {
    if (!selectedHotspot) {
      return;
    }
    updateDraft((current) => {
      const nextHotspots = resequenceHotspots(
        current.hotspots.filter((hotspot) => hotspot.id !== selectedHotspot.id),
      );
      setSelectedHotspotId(nextHotspots[0]?.id ?? null);
      return {
        ...current,
        hotspots: nextHotspots,
      };
    });
  }

  function nudgeSelectedHotspot(direction: "left" | "right" | "up" | "down") {
    if (!selectedHotspot) {
      return;
    }
    const delta = 0.01;
    updateDraft((current) => ({
      ...current,
      hotspots: current.hotspots.map((hotspot) => {
        if (hotspot.id !== selectedHotspot.id) {
          return hotspot;
        }
        return {
          ...hotspot,
          x:
            direction === "left"
              ? clampPosition(hotspot.x - delta)
              : direction === "right"
                ? clampPosition(hotspot.x + delta)
                : hotspot.x,
          y:
            direction === "up"
              ? clampPosition(hotspot.y - delta)
              : direction === "down"
                ? clampPosition(hotspot.y + delta)
                : hotspot.y,
        };
      }),
    }));
  }

  function moveHotspot(hotspotId: string, x: number, y: number) {
    updateDraft((current) => ({
      ...current,
      hotspots: current.hotspots.map((hotspot) =>
        hotspot.id === hotspotId ? { ...hotspot, x, y } : hotspot,
      ),
    }));
  }

  function moveHotspots(updates: Array<{ hotspotId: string; x: number; y: number }>) {
    updateDraft((current) => ({
      ...current,
      hotspots: current.hotspots.map((hotspot) => {
        const nextUpdate = updates.find((update) => update.hotspotId === hotspot.id);
        return nextUpdate ? { ...hotspot, x: nextUpdate.x, y: nextUpdate.y } : hotspot;
      }),
    }));
  }

  function selectHotspot(hotspotId: string) {
    setSelectedHotspotId(hotspotId);
  }

  function replaceSelection(hotspotIds: string[]) {
    setSelectedHotspotId(hotspotIds[0] ?? null);
  }

  return {
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
  };
}
