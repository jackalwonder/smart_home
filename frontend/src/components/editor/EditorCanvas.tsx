export function EditorCanvas() {
  return (
    <section className="card editor-canvas">
      <div className="card__header">
        <div>
          <span className="card__eyebrow">Canvas</span>
          <h3>编辑画布</h3>
        </div>
        <div className="page__badge-row">
          <span className="status-pill">normalized coords</span>
          <span className="status-pill">preview only</span>
        </div>
      </div>
      <div className="editor-canvas__surface">
        <div className="editor-canvas__grid" />
        <div className="editor-canvas__note">
          这里将承接底图、热点拖拽、结构排序、显隐控制与本端预览。
        </div>
      </div>
    </section>
  );
}
