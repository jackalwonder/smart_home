import type { PointerEvent } from "react";
import { useState } from "react";
import { EditorHotspotViewModel } from "../../view-models/editor";

interface EditorSelectionLayerProps {
  hotspots: EditorHotspotViewModel[];
  selectedHotspotId: string | null;
  canEdit: boolean;
  onSelectHotspot: (hotspotId: string) => void;
  onMoveHotspot: (hotspotId: string, x: number, y: number) => void;
}

export function EditorSelectionLayer({
  hotspots,
  selectedHotspotId,
  canEdit,
  onSelectHotspot,
  onMoveHotspot,
}: EditorSelectionLayerProps) {
  const [draggingHotspotId, setDraggingHotspotId] = useState<string | null>(null);

  function updatePosition(
    hotspotId: string,
    event: PointerEvent<HTMLButtonElement>,
  ) {
    if (!canEdit) {
      return;
    }

    const container = event.currentTarget.parentElement;
    if (!container) {
      return;
    }
    const rect = container.getBoundingClientRect();
    const x = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    const y = Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1);
    onMoveHotspot(hotspotId, x, y);
  }

  return (
    <div className="editor-selection-layer">
      {hotspots.map((hotspot) => (
        <button
          key={hotspot.id}
          className={
            hotspot.id === draggingHotspotId
              ? "editor-selection-layer__item is-selected is-dragging"
              : hotspot.id === selectedHotspotId
                ? "editor-selection-layer__item is-selected"
                : "editor-selection-layer__item"
          }
          onClick={() => onSelectHotspot(hotspot.id)}
          onPointerDown={(event) => {
            onSelectHotspot(hotspot.id);
            if (canEdit) {
              setDraggingHotspotId(hotspot.id);
              event.currentTarget.setPointerCapture(event.pointerId);
            }
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              updatePosition(hotspot.id, event);
            }
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            setDraggingHotspotId(null);
          }}
          onPointerCancel={() => {
            setDraggingHotspotId(null);
          }}
          style={{ left: `${hotspot.x * 100}%`, top: `${hotspot.y * 100}%` }}
          type="button"
        >
          {hotspot.label}
          <small>{`${Math.round(hotspot.x * 100)}%, ${Math.round(hotspot.y * 100)}%`}</small>
        </button>
      ))}
    </div>
  );
}
