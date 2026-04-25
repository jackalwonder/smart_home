import type { ReactNode } from "react";

interface SettingsTaskModuleProps {
  action?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  description: string;
  detailLabel?: string;
  eyebrow: string;
  id?: string;
  status: string;
  statusTone?: "success" | "warning" | "danger" | "neutral";
  title: string;
}

export function SettingsTaskModule({
  action,
  children,
  defaultOpen = false,
  description,
  detailLabel = "配置与详情",
  eyebrow,
  id,
  status,
  statusTone = "neutral",
  title,
}: SettingsTaskModuleProps) {
  return (
    <section className="settings-task-module" id={id}>
      <div className="settings-task-module__header">
        <div>
          <span className="card-eyebrow">{eyebrow}</span>
          <h3>{title}</h3>
          <p className="muted-copy">{description}</p>
        </div>
        <div className="settings-task-module__actions">
          <span className={`state-chip settings-state-chip is-${statusTone}`}>{status}</span>
          {action}
        </div>
      </div>
      <details className="settings-task-module__details" open={defaultOpen}>
        <summary>{detailLabel}</summary>
        <div className="settings-task-module__body">{children}</div>
      </details>
    </section>
  );
}
