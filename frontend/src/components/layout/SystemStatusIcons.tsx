import type { ReactNode } from "react";

interface SystemStatusIconsProps {
  connected: boolean;
  pinVerified: boolean;
  featureFlags: Array<{ label: string; active: boolean }>;
  inlineAction?: ReactNode;
}

export function SystemStatusIcons({
  connected,
  pinVerified,
  featureFlags,
  inlineAction,
}: SystemStatusIconsProps) {
  return (
    <div className="system-status-icons">
      <span className={connected ? "signal-pill is-active" : "signal-pill"}>HA</span>
      {inlineAction}
      <span className={pinVerified ? "signal-pill is-active" : "signal-pill"}>PIN</span>
      {featureFlags.map((flag) => (
        <span
          key={flag.label}
          className={flag.active ? "signal-pill is-accent" : "signal-pill is-muted"}
        >
          {flag.label}
        </span>
      ))}
    </div>
  );
}
