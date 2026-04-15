import { PropsWithChildren } from "react";

export interface SettingsModuleRow {
  label: string;
  value: string;
}

interface SettingsModuleCardProps extends PropsWithChildren {
  title: string;
  eyebrow: string;
  description: string;
  rows?: SettingsModuleRow[];
}

export function SettingsModuleCard({
  title,
  eyebrow,
  description,
  rows = [],
  children,
}: SettingsModuleCardProps) {
  return (
    <section className="panel settings-module-card">
      <div className="panel__header">
        <div>
          <span className="card-eyebrow">{eyebrow}</span>
          <h3>{title}</h3>
          <p className="muted-copy">{description}</p>
        </div>
      </div>
      {rows.length ? (
        <dl className="field-grid">
          {rows.map((row) => (
            <div key={`${title}-${row.label}`}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {children}
    </section>
  );
}
