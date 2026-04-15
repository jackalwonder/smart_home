interface HomeQuickEntriesPanelProps {
  entries: Array<Record<string, unknown>>;
}

export function HomeQuickEntriesPanel({ entries }: HomeQuickEntriesPanelProps) {
  return (
    <section className="card">
      <div className="card__header">
        <div>
          <span className="card__eyebrow">Quick Entries</span>
          <h3>Quick entries</h3>
        </div>
      </div>

      <div className="quick-entry-grid">
        {entries.length ? (
          entries.map((entry, index) => (
            <article
              key={String(entry.key ?? `quick-entry-${index}`)}
              className="quick-entry-card"
            >
              <span>{String(entry.title ?? entry.key ?? "entry")}</span>
              <strong>{String(entry.badge_count ?? "-")}</strong>
            </article>
          ))
        ) : (
          <p className="page__hint">
            Frozen overview is connected. Quick entry payload will appear here once data is seeded.
          </p>
        )}
      </div>
    </section>
  );
}
