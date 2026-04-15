interface SettingsOverviewCardProps {
  rows: Array<{ label: string; value: string }>;
}

export function SettingsOverviewCard({ rows }: SettingsOverviewCardProps) {
  return (
    <section className="utility-card">
      <span className="card-eyebrow">快照</span>
      <h3>当前环境</h3>
      <dl className="field-grid">
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
