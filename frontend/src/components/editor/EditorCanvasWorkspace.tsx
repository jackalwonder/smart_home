import { EditorHotspotViewModel } from "../../view-models/editor";
import { resolveAssetImageUrl } from "../../api/pageAssetsApi";
import { EditorSelectionLayer } from "./EditorSelectionLayer";

interface EditorCanvasWorkspaceProps {
  backgroundImageUrl: string | null;
  hotspots: EditorHotspotViewModel[];
  selectedHotspotId: string | null;
  batchSelectedHotspotIds: string[];
  canEdit: boolean;
  mode: "edit" | "preview";
  onModeChange: (mode: "edit" | "preview") => void;
  onSelectHotspot: (
    hotspotId: string,
    options?: { toggleBatch?: boolean; preserveBatch?: boolean },
  ) => void;
  onReplaceBatchSelection: (hotspotIds: string[]) => void;
  onMoveHotspot: (hotspotId: string, x: number, y: number) => void;
  onMoveHotspots: (updates: Array<{ hotspotId: string; x: number; y: number }>) => void;
}

export function EditorCanvasWorkspace({
  backgroundImageUrl,
  hotspots,
  selectedHotspotId,
  batchSelectedHotspotIds,
  canEdit,
  mode,
  onModeChange,
  onSelectHotspot,
  onReplaceBatchSelection,
  onMoveHotspot,
  onMoveHotspots,
}: EditorCanvasWorkspaceProps) {
  const resolvedBackgroundImageUrl = resolveAssetImageUrl(backgroundImageUrl);
  const visibleHotspots = hotspots.filter((hotspot) => hotspot.isVisible);
  const displayedHotspots = mode === "preview" ? visibleHotspots : hotspots;

  return (
    <section className="panel editor-canvas-workspace">
      <div className="panel__header">
        <div>
          <span className="card-eyebrow">画布</span>
          <h3>{mode === "preview" ? "首页预览" : "当前草稿布局"}</h3>
          <p className="muted-copy">
            {mode === "preview"
              ? "首页预览仅显示可见热点。"
              : "拖动热点调整位置，空白处拖拽可框选多个热点。"}
          </p>
        </div>
        <div className="badge-row">
          <button
            className={mode === "edit" ? "button button--primary" : "button button--ghost"}
            onClick={() => onModeChange("edit")}
            type="button"
          >
            编辑定位
          </button>
          <button
            className={mode === "preview" ? "button button--primary" : "button button--ghost"}
            onClick={() => onModeChange("preview")}
            type="button"
          >
            首页预览
          </button>
        </div>
      </div>
      <div className="editor-canvas-workspace__surface">
        {resolvedBackgroundImageUrl ? (
          <img
            alt="编辑器草稿户型图"
            className="editor-canvas-workspace__image"
            src={resolvedBackgroundImageUrl}
          />
        ) : (
          <div className="floorplan-fallback editor-canvas-workspace__placeholder" aria-hidden="true">
            <span className="floorplan-fallback__room floorplan-fallback__room--living" />
            <span className="floorplan-fallback__room floorplan-fallback__room--kitchen" />
            <span className="floorplan-fallback__room floorplan-fallback__room--bedroom" />
            <span className="floorplan-fallback__room floorplan-fallback__room--study" />
            <span className="floorplan-fallback__room floorplan-fallback__room--bath" />
            <span className="floorplan-fallback__wall floorplan-fallback__wall--one" />
            <span className="floorplan-fallback__wall floorplan-fallback__wall--two" />
            <span className="floorplan-fallback__wall floorplan-fallback__wall--three" />
          </div>
        )}
        <EditorSelectionLayer
          batchSelectedHotspotIds={batchSelectedHotspotIds}
          canEdit={canEdit && mode === "edit"}
          hotspots={displayedHotspots}
          mode={mode}
          onMoveHotspot={onMoveHotspot}
          onMoveHotspots={onMoveHotspots}
          onReplaceBatchSelection={onReplaceBatchSelection}
          onSelectHotspot={onSelectHotspot}
          selectedHotspotId={selectedHotspotId}
        />
      </div>
    </section>
  );
}
