import { useAppStore } from "../../store/useAppStore";

interface DraftLayoutView {
  background_image_url?: string | null;
  hotspots?: Array<{
    hotspot_id?: string;
    display_name?: string;
    x?: number;
    y?: number;
  }>;
  layout_meta?: Record<string, unknown>;
}

export function EditorCanvasPanel() {
  const editor = useAppStore((state) => state.editor);
  const draft = (editor.draft as DraftLayoutView | null) ?? null;
  const hotspots = draft?.hotspots ?? [];

  return (
    <section className="card editor-canvas">
      <div className="card__header">
        <div>
          <span className="card__eyebrow">Canvas</span>
          <h3>Draft preview</h3>
        </div>
        <div className="page__badge-row">
          <span className="status-pill">
            {editor.readonly ? "readonly preview" : "lease granted"}
          </span>
          <span className="status-pill">{editor.draftStatus}</span>
        </div>
      </div>

      <div className="editor-canvas__surface">
        {draft?.background_image_url ? (
          <img
            alt="Draft floorplan"
            className="floorplan-stage__image"
            src={draft.background_image_url}
          />
        ) : null}
        <div className="editor-canvas__grid" />
        {hotspots.length ? (
          <div className="floorplan-stage__hotspots">
            {hotspots.map((hotspot, index) => (
              <div
                key={hotspot.hotspot_id ?? `draft-hotspot-${index}`}
                className="floorplan-stage__hotspot"
                style={{
                  left: `${Number(hotspot.x ?? 0) * 100}%`,
                  top: `${Number(hotspot.y ?? 0) * 100}%`,
                }}
              >
                {hotspot.display_name ?? hotspot.hotspot_id ?? `hotspot-${index + 1}`}
              </div>
            ))}
          </div>
        ) : (
          <div className="editor-canvas__note">
            Current backend draft has no hotspots yet. This area is now reading the real draft API.
          </div>
        )}
      </div>
    </section>
  );
}
