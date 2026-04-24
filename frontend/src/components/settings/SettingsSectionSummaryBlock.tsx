import type { ReactNode } from "react";

interface SettingsSectionSummaryBlockProps {
  rows: Array<{ label: string; value: ReactNode }>;
  actions?: ReactNode;
}

export function SettingsSectionSummaryBlock({
  rows,
  actions,
}: SettingsSectionSummaryBlockProps) {
  return (
    <section className="utility-card settings-section-summary">
      <div className="settings-section-summary__grid">
        {rows.map((row, index) => (
          <div key={`${row.label}-${index}`}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>
      {actions ? <div className="badge-row">{actions}</div> : null}
    </section>
  );
}
