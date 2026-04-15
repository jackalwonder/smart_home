import { useAppStore } from "../../store/useAppStore";

export function EditorLeasePanel() {
  const editor = useAppStore((state) => state.editor);
  const events = useAppStore((state) => state.wsEvents);

  return (
    <aside className="card editor-status-panel">
      <div className="card__header">
        <div>
          <span className="card__eyebrow">Lease</span>
          <h3>Editor session</h3>
        </div>
      </div>

      <div className="metric-grid">
        <article className="metric-card">
          <span>lock_status</span>
          <strong>{editor.lockStatus ?? "-"}</strong>
        </article>
        <article className="metric-card">
          <span>lease_id</span>
          <strong>{editor.leaseId ?? "-"}</strong>
        </article>
        <article className="metric-card">
          <span>draft_version</span>
          <strong>{editor.draftVersion ?? "-"}</strong>
        </article>
        <article className="metric-card">
          <span>base_layout</span>
          <strong>{editor.baseLayoutVersion ?? "-"}</strong>
        </article>
      </div>

      <p className="page__hint">
        {editor.readonly
          ? "Readonly preview is active until the management PIN is verified."
          : "Lease is active. This terminal can continue with heartbeat and draft save."}
      </p>

      <h4>Recent events</h4>
      <div className="event-list">
        {events.length ? (
          events.slice(0, 6).map((event) => (
            <article key={event.event_id} className="event-list__item">
              <strong>{event.event_type}</strong>
              <span>{event.change_domain}</span>
            </article>
          ))
        ) : (
          <p className="page__hint">No realtime events received yet.</p>
        )}
      </div>
    </aside>
  );
}
