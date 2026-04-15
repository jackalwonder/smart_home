interface EditorRealtimeFeedProps {
  rows: Array<{ id: string; title: string; subtitle: string }>;
}

export function EditorRealtimeFeed({ rows }: EditorRealtimeFeedProps) {
  return (
    <section className="utility-card editor-realtime-feed">
      <span className="card-eyebrow">实时</span>
      <h3>最近事件</h3>
      <div className="editor-realtime-feed__list">
        {rows.length ? (
          rows.map((row) => (
            <article key={row.id} className="editor-realtime-feed__item">
              <strong>{row.title}</strong>
              <span>{row.subtitle}</span>
            </article>
          ))
        ) : (
          <p className="muted-copy">当前还没有收到实时事件。</p>
        )}
      </div>
    </section>
  );
}
