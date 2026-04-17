import { EditorHotspotViewModel } from "../../view-models/editor";
import { resolveAssetImageUrl } from "../../api/pageAssetsApi";
import { EditorSelectionLayer } from "./EditorSelectionLayer";

interface EditorCanvasWorkspaceProps {
  backgroundImageUrl: string | null;
  hotspots: EditorHotspotViewModel[];
  selectedHotspotId: string | null;
  canEdit: boolean;
  onSelectHotspot: (hotspotId: string) => void;
  onMoveHotspot: (hotspotId: string, x: number, y: number) => void;
}

export function EditorCanvasWorkspace({
  backgroundImageUrl,
  hotspots,
  selectedHotspotId,
  canEdit,
  onSelectHotspot,
  onMoveHotspot,
}: EditorCanvasWorkspaceProps) {
  const resolvedBackgroundImageUrl = resolveAssetImageUrl(backgroundImageUrl);

  return (
    <section className="panel editor-canvas-workspace">
      <div className="panel__header">
        <div>
          <span className="card-eyebrow">画布</span>
          <h3>当前草稿布局</h3>
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
          canEdit={canEdit}
          hotspots={hotspots}
          onMoveHotspot={onMoveHotspot}
          onSelectHotspot={onSelectHotspot}
          selectedHotspotId={selectedHotspotId}
        />
      </div>
    </section>
  );
}
