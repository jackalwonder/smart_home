import type { ReactNode } from "react";

interface AuditTimelineProps<T> {
  ariaLabel: string;
  canEdit: boolean;
  emptyLabel: string;
  items: T[];
  loading: boolean;
  loadingLabel: string;
  refreshLabel: string;
  sectionDescription: string;
  sectionTitle: string;
  onRefresh: () => void;
  getItemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
}

export function AuditTimeline<T>({
  ariaLabel,
  canEdit,
  emptyLabel,
  items,
  loading,
  loadingLabel,
  refreshLabel,
  sectionDescription,
  sectionTitle,
  onRefresh,
  getItemKey,
  renderItem,
}: AuditTimelineProps<T>) {
  return (
    <section className="backup-audit" aria-label={ariaLabel}>
      <div className="backup-audit__header">
        <div>
          <h4>{sectionTitle}</h4>
          <p className="muted-copy">{sectionDescription}</p>
        </div>
        <button
          className="button button--ghost"
          disabled={!canEdit || loading}
          onClick={onRefresh}
          type="button"
        >
          {loading ? loadingLabel : refreshLabel}
        </button>
      </div>
      <div className="backup-audit__timeline">
        {items.length ? (
          items.map((item) => (
            <article className="backup-audit__item" key={getItemKey(item)}>
              {renderItem(item)}
            </article>
          ))
        ) : (
          <p className="backup-list__empty">{emptyLabel}</p>
        )}
      </div>
    </section>
  );
}
