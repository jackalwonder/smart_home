import type { EditorHotspotViewModel } from "../../view-models/editor";

interface UseEditorHotspotSelectionOptions {
  replaceBatchSelection: (hotspotIds: string[]) => void;
  selectSingleHotspot: (
    hotspotId: string,
    options?: { keepBatch?: boolean },
  ) => void;
  setSelectedHotspotId: (
    value: string | null | ((current: string | null) => string | null),
  ) => void;
  toggleBatchHotspot: (hotspotId: string) => void;
  visibleHotspots: EditorHotspotViewModel[];
}

export function useEditorHotspotSelection({
  replaceBatchSelection,
  selectSingleHotspot,
  setSelectedHotspotId,
  toggleBatchHotspot,
  visibleHotspots,
}: UseEditorHotspotSelectionOptions) {
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

  return {
    handleCanvasHotspotPointer,
    selectAllVisibleHotspots,
  };
}
