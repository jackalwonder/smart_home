import { EditorHotspotViewModel } from "../../view-models/editor";
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
  return (
    <section className="panel editor-canvas-workspace">
      <div className="panel__header">
        <div>
          <span className="card-eyebrow">画布</span>
          <h3>当前草稿布局</h3>
        </div>
      </div>
      <div className="editor-canvas-workspace__surface">
        {backgroundImageUrl ? (
          <img
            alt="编辑器草稿户型图"
            className="editor-canvas-workspace__image"
            src={backgroundImageUrl}
          />
        ) : (
          <div className="editor-canvas-workspace__placeholder">
            当前草稿还没有绑定背景图。
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
