interface HomeQuickEntriesProps {
  entries: Array<Record<string, unknown>>;
}

export function HomeQuickEntries({ entries }: HomeQuickEntriesProps) {
  return (
    <section className="card">
      <div className="card__header">
        <div>
          <span className="card__eyebrow">Quick Entries</span>
          <h3>快捷入口</h3>
        </div>
      </div>
      <div className="quick-entry-grid">
        {entries.length ? (
          entries.map((entry) => (
            <article key={String(entry.key)} className="quick-entry-card">
              <span>{String(entry.title ?? entry.key)}</span>
              <strong>{String(entry.badge_count ?? "-")}</strong>
            </article>
          ))
        ) : (
          <p className="page__hint">后续接首页快捷入口与浮层数据。</p>
        )}
      </div>
    </section>
  );
}
