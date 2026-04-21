import type { PointerEvent } from "react";
import { useMemo, useState } from "react";
import { HotspotIcon } from "../home/HotspotIcon";
import { EditorHotspotViewModel } from "../../view-models/editor";

interface EditorSelectionLayerProps {
  hotspots: EditorHotspotViewModel[];
  selectedHotspotId: string | null;
  batchSelectedHotspotIds: string[];
  canEdit: boolean;
  mode: "edit" | "preview";
  onSelectHotspot: (
    hotspotId: string,
    options?: { toggleBatch?: boolean; preserveBatch?: boolean },
  ) => void;
  onReplaceBatchSelection: (hotspotIds: string[]) => void;
  onMoveHotspot: (hotspotId: string, x: number, y: number) => void;
  onMoveHotspots: (updates: Array<{ hotspotId: string; x: number; y: number }>) => void;
}

interface EditorMarqueeState {
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface EditorDragState {
  pointerId: number;
  hotspotIds: string[];
  originX: number;
  originY: number;
  initialPositions: Map<string, { x: number; y: number }>;
}

function clampPosition(value: number) {
  return Math.min(Math.max(value, 0), 1);
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

function getCanvasCoordinates(
  container: HTMLDivElement,
  event: PointerEvent<HTMLElement>,
) {
  const rect = container.getBoundingClientRect();
  return {
    x: clampPosition((event.clientX - rect.left) / rect.width),
    y: clampPosition((event.clientY - rect.top) / rect.height),
  };
}

export function EditorSelectionLayer({
  hotspots,
  selectedHotspotId,
  batchSelectedHotspotIds,
  canEdit,
  mode,
  onSelectHotspot,
  onReplaceBatchSelection,
  onMoveHotspot,
  onMoveHotspots,
}: EditorSelectionLayerProps) {
  const [draggingHotspotId, setDraggingHotspotId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<EditorDragState | null>(null);
  const [marquee, setMarquee] = useState<EditorMarqueeState | null>(null);
  const batchSelectedSet = useMemo(
    () => new Set(batchSelectedHotspotIds),
    [batchSelectedHotspotIds],
  );

  function finishMarqueeSelection() {
    if (!marquee) {
      return;
    }
    const minX = Math.min(marquee.startX, marquee.currentX);
    const maxX = Math.max(marquee.startX, marquee.currentX);
    const minY = Math.min(marquee.startY, marquee.currentY);
    const maxY = Math.max(marquee.startY, marquee.currentY);
    const selectedIds = hotspots
      .filter((hotspot) => hotspot.x >= minX && hotspot.x <= maxX && hotspot.y >= minY && hotspot.y <= maxY)
      .map((hotspot) => hotspot.id);
    onReplaceBatchSelection(selectedIds);
    setMarquee(null);
  }

  return (
    <div
      className="editor-selection-layer"
      onPointerCancel={() => {
        setMarquee(null);
      }}
      onPointerDown={(event) => {
        if (!canEdit || mode !== "edit" || event.target !== event.currentTarget) {
          return;
        }
        const point = getCanvasCoordinates(event.currentTarget, event);
        setMarquee({
          pointerId: event.pointerId,
          startX: point.x,
          startY: point.y,
          currentX: point.x,
          currentY: point.y,
        });
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!marquee || marquee.pointerId !== event.pointerId) {
          return;
        }
        const point = getCanvasCoordinates(event.currentTarget, event);
        setMarquee((current) =>
          current
            ? {
                ...current,
                currentX: point.x,
                currentY: point.y,
              }
            : current,
        );
      }}
      onPointerUp={(event) => {
        if (!marquee || marquee.pointerId !== event.pointerId) {
          return;
        }
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        finishMarqueeSelection();
      }}
    >
      {hotspots.map((hotspot) => {
        const showPreviewLabel = mode === "preview" && hotspot.labelMode !== "HIDDEN";
        const isBatchSelected = batchSelectedSet.has(hotspot.id);
        const isSelected = hotspot.id === selectedHotspotId || isBatchSelected;
        return (
          <button
            key={hotspot.id}
            aria-label={hotspot.label}
            className={
              hotspot.id === draggingHotspotId
                ? `editor-selection-layer__item is-selected is-dragging is-${mode}`
                : isSelected
                  ? `editor-selection-layer__item is-selected is-${mode}`
                  : !hotspot.isVisible
                    ? `editor-selection-layer__item is-muted is-${mode}`
                    : `editor-selection-layer__item is-${mode}`
            }
            onClick={(event) => {
              event.preventDefault();
            }}
            onPointerCancel={() => {
              setDraggingHotspotId(null);
              setDragState(null);
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
              const preserveBatch =
                batchSelectedSet.has(hotspot.id) && batchSelectedSet.size > 1 && !event.shiftKey;
              onSelectHotspot(
                hotspot.id,
                event.shiftKey ? { toggleBatch: true } : { preserveBatch },
              );
              if (!canEdit || event.shiftKey) {
                return;
              }

              const container = event.currentTarget.parentElement;
              if (!(container instanceof HTMLDivElement)) {
                return;
              }
              const point = getCanvasCoordinates(container, event);
              const dragIds = preserveBatch ? batchSelectedHotspotIds : [hotspot.id];
              setDraggingHotspotId(hotspot.id);
              setDragState({
                pointerId: event.pointerId,
                hotspotIds: dragIds,
                originX: point.x,
                originY: point.y,
                initialPositions: new Map(
                  hotspots
                    .filter((item) => dragIds.includes(item.id))
                    .map((item) => [item.id, { x: item.x, y: item.y }]),
                ),
              });
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (
                !dragState ||
                dragState.pointerId !== event.pointerId ||
                !event.currentTarget.hasPointerCapture(event.pointerId)
              ) {
                return;
              }
              const container = event.currentTarget.parentElement;
              if (!(container instanceof HTMLDivElement)) {
                return;
              }
              const point = getCanvasCoordinates(container, event);
              const deltaX = point.x - dragState.originX;
              const deltaY = point.y - dragState.originY;
              const updates = dragState.hotspotIds
                .map((hotspotId) => {
                  const initial = dragState.initialPositions.get(hotspotId);
                  if (!initial) {
                    return null;
                  }
                  return {
                    hotspotId,
                    x: clampPosition(initial.x + deltaX),
                    y: clampPosition(initial.y + deltaY),
                  };
                })
                .filter(
                  (
                    update,
                  ): update is { hotspotId: string; x: number; y: number } => Boolean(update),
                );

              if (updates.length > 1) {
                onMoveHotspots(updates);
                return;
              }
              const update = updates[0];
              if (update) {
                onMoveHotspot(update.hotspotId, update.x, update.y);
              }
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              setDraggingHotspotId(null);
              setDragState(null);
            }}
            style={{ left: `${hotspot.x * 100}%`, top: `${hotspot.y * 100}%` }}
            type="button"
          >
            {mode === "preview" ? (
              <>
                <span className="editor-selection-layer__badge">
                  <HotspotIcon
                    deviceType={hotspot.iconType}
                    iconAssetUrl={hotspot.iconAssetUrl}
                    iconType={hotspot.iconType}
                    variant="editor-preview"
                  />
                </span>
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
      {marquee ? (
        <div
          className="editor-selection-layer__marquee"
          style={{
            left: `${Math.min(marquee.startX, marquee.currentX) * 100}%`,
            top: `${Math.min(marquee.startY, marquee.currentY) * 100}%`,
            width: `${Math.abs(marquee.currentX - marquee.startX) * 100}%`,
            height: `${Math.abs(marquee.currentY - marquee.startY) * 100}%`,
          }}
        />
      ) : null}
    </div>
  );
}
