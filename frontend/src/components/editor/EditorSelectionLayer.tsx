import type { PointerEvent } from "react";
import { useState } from "react";
import { EditorHotspotViewModel } from "../../view-models/editor";

interface EditorSelectionLayerProps {
  hotspots: EditorHotspotViewModel[];
  selectedHotspotId: string | null;
  canEdit: boolean;
  mode: "edit" | "preview";
  onSelectHotspot: (hotspotId: string) => void;
  onMoveHotspot: (hotspotId: string, x: number, y: number) => void;
}

function deriveEditorPreviewGlyph(hotspot: EditorHotspotViewModel) {
  const source = `${hotspot.iconType} ${hotspot.deviceId} ${hotspot.label}`.toLowerCase();

  if (source.includes("light") || source.includes("lamp")) {
    return "灯";
  }
  if (source.includes("fan")) {
    return "扇";
  }
  if (source.includes("climate") || source.includes("air")) {
    return "空";
  }
  if (source.includes("curtain") || source.includes("cover")) {
    return "帘";
  }
  if (source.includes("sensor")) {
    return "感";
  }
  if (source.includes("media") || source.includes("tv")) {
    return "媒";
  }

  return "控";
}

export function EditorSelectionLayer({
  hotspots,
  selectedHotspotId,
  canEdit,
  mode,
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
      {hotspots.map((hotspot) => {
        const showPreviewLabel = mode === "preview" && hotspot.labelMode !== "HIDDEN";
        return (
          <button
            key={hotspot.id}
            aria-label={hotspot.label}
            className={
              hotspot.id === draggingHotspotId
                ? `editor-selection-layer__item is-selected is-dragging is-${mode}`
                : hotspot.id === selectedHotspotId
                  ? `editor-selection-layer__item is-selected is-${mode}`
                  : !hotspot.isVisible
                    ? `editor-selection-layer__item is-muted is-${mode}`
                    : `editor-selection-layer__item is-${mode}`
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
            {mode === "preview" ? (
              <>
                <i className="editor-selection-layer__pulse" />
                <b>{deriveEditorPreviewGlyph(hotspot)}</b>
                {showPreviewLabel ? <span>{hotspot.label}</span> : null}
                {showPreviewLabel ? <small>发布后首页展示</small> : null}
              </>
            ) : (
              <>
                <span>{hotspot.label}</span>
                <small>{`${Math.round(hotspot.x * 100)}%, ${Math.round(hotspot.y * 100)}%`}</small>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
