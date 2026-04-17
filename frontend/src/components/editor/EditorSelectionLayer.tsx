import type { PointerEvent } from "react";
import { useMemo, useState } from "react";
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
  activeHotspotId: string;
  originX: number;
  originY: number;
  initialPositions: Map<string, { x: number; y: number }>;
}

interface EditorSnapGuides {
  x: number | null;
  y: number | null;
}

const SNAP_THRESHOLD = 0.015;
const GRID_STEP = 0.02;

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

function findSnapTarget(value: number, candidates: number[]) {
  let bestTarget: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const distance = Math.abs(candidate - value);
    if (distance <= SNAP_THRESHOLD && distance < bestDistance) {
      bestTarget = candidate;
      bestDistance = distance;
    }
  }
  return bestTarget;
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
  const [snapGuides, setSnapGuides] = useState<EditorSnapGuides>({ x: null, y: null });
  const batchSelectedSet = useMemo(
    () => new Set(batchSelectedHotspotIds),
    [batchSelectedHotspotIds],
  );
  const selectionIds = batchSelectedHotspotIds.length
    ? batchSelectedHotspotIds
    : selectedHotspotId
      ? [selectedHotspotId]
      : [];
  const selectionBounds =
    selectionIds.length > 1
      ? (() => {
          const selectedHotspots = hotspots.filter((hotspot) => selectionIds.includes(hotspot.id));
          if (!selectedHotspots.length) {
            return null;
          }
          const xValues = selectedHotspots.map((hotspot) => hotspot.x);
          const yValues = selectedHotspots.map((hotspot) => hotspot.y);
          return {
            left: Math.min(...xValues),
            right: Math.max(...xValues),
            top: Math.min(...yValues),
            bottom: Math.max(...yValues),
            count: selectedHotspots.length,
          };
        })()
      : null;

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
        setDragState(null);
        setDraggingHotspotId(null);
        setSnapGuides({ x: null, y: null });
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
                activeHotspotId: hotspot.id,
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
              const draftUpdates = dragState.hotspotIds
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
              const activeUpdate = draftUpdates.find(
                (update) => update.hotspotId === dragState.activeHotspotId,
              );
              if (!activeUpdate) {
                return;
              }
              const otherHotspots = hotspots.filter(
                (hotspot) => !dragState.hotspotIds.includes(hotspot.id),
              );
              const gridCandidatesX = Array.from({ length: Math.floor(1 / GRID_STEP) + 1 }, (_, index) =>
                clampPosition(index * GRID_STEP),
              );
              const gridCandidatesY = gridCandidatesX;
              const snappedX =
                findSnapTarget(activeUpdate.x, otherHotspots.map((hotspot) => hotspot.x)) ??
                findSnapTarget(activeUpdate.x, gridCandidatesX);
              const snappedY =
                findSnapTarget(activeUpdate.y, otherHotspots.map((hotspot) => hotspot.y)) ??
                findSnapTarget(activeUpdate.y, gridCandidatesY);
              const offsetX = snappedX !== null ? snappedX - activeUpdate.x : 0;
              const offsetY = snappedY !== null ? snappedY - activeUpdate.y : 0;
              const updates = draftUpdates.map((update) => ({
                ...update,
                x: clampPosition(update.x + offsetX),
                y: clampPosition(update.y + offsetY),
              }));
              setSnapGuides({ x: snappedX, y: snappedY });

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
              setSnapGuides({ x: null, y: null });
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
      {marquee ? (
        <div
          className="editor-selection-layer__marquee-badge"
          style={{
            left: `${Math.min(marquee.startX, marquee.currentX) * 100}%`,
            top: `${Math.max(marquee.startY, marquee.currentY) * 100}%`,
          }}
        >
          框选中
        </div>
      ) : null}
      {selectionBounds ? (
        <>
          <div
            className="editor-selection-layer__selection-box"
            style={{
              left: `${selectionBounds.left * 100}%`,
              top: `${selectionBounds.top * 100}%`,
              width: `${Math.max((selectionBounds.right - selectionBounds.left) * 100, 2)}%`,
              height: `${Math.max((selectionBounds.bottom - selectionBounds.top) * 100, 2)}%`,
            }}
          />
          <div
            className="editor-selection-layer__selection-badge"
            style={{
              left: `${selectionBounds.left * 100}%`,
              top: `${selectionBounds.top * 100}%`,
            }}
          >
            {selectionBounds.count} 个热点
          </div>
        </>
      ) : null}
      {snapGuides.x !== null ? (
        <div
          className="editor-selection-layer__guide editor-selection-layer__guide--vertical"
          style={{ left: `${snapGuides.x * 100}%` }}
        />
      ) : null}
      {snapGuides.y !== null ? (
        <div
          className="editor-selection-layer__guide editor-selection-layer__guide--horizontal"
          style={{ top: `${snapGuides.y * 100}%` }}
        />
      ) : null}
    </div>
  );
}
