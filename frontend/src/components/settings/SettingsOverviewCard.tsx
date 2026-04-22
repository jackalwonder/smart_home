interface SettingsOverviewCardProps {
  rows: Array<{ label: string; value: string }>;
}

export function SettingsOverviewCard({ rows }: SettingsOverviewCardProps) {
  return (
    <section className="utility-card settings-overview-card">
      <div className="settings-overview-card__header">
        <span className="card-eyebrow">摘要</span>
        <h3>当前环境</h3>
      </div>
      <div className="settings-overview-card__list">
        {rows.map((row) => (
          <div className="settings-overview-card__item" key={row.label}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
