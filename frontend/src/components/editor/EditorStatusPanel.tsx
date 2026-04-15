import { useAppStore } from "../../store/useAppStore";

export function EditorStatusPanel() {
  const editor = useAppStore((state) => state.editor);
  const events = useAppStore((state) => state.wsEvents);

  return (
    <aside className="card editor-status-panel">
      <div className="card__header">
        <div>
          <span className="card__eyebrow">Lease</span>
          <h3>编辑锁状态</h3>
        </div>
      </div>
      <p>lock_status: {editor.lockStatus ?? "-"}</p>
      <p>lease_id: {editor.leaseId ?? "-"}</p>
      <h4>最近事件</h4>
      <div className="event-list">
        {events.length ? (
          events.slice(0, 6).map((event) => (
            <article key={event.event_id} className="event-list__item">
              <strong>{event.event_type}</strong>
              <span>{event.change_domain}</span>
            </article>
          ))
        ) : (
          <p className="page__hint">等待实时事件</p>
        )}
      </div>
    </aside>
  );
}
