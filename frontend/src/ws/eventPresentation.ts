import type { WsChangeDomain, WsEvent, WsEventType } from "./types";

export interface RealtimeEventPresentation {
  title: string;
  domainLabel: string;
  subtitle: string;
}

const EVENT_LABELS = {
  backup_restore_completed: "Backup restored",
  device_state_changed: "Device state changed",
  draft_lock_acquired: "Editor lock acquired",
  energy_refresh_completed: "Energy refreshed",
  energy_refresh_failed: "Energy refresh failed",
  ha_sync_degraded: "Home Assistant sync degraded",
  ha_sync_recovered: "Home Assistant sync recovered",
  media_state_changed: "Media state changed",
  publish_succeeded: "Layout published",
  settings_updated: "Settings updated",
  summary_updated: "Home summary refreshed",
  version_conflict_detected: "Snapshot required",
} satisfies Record<WsEventType, string>;

const DOMAIN_LABELS = {
  BACKUP: "Backup",
  DEVICE_STATE: "Device state",
  EDITOR_LOCK: "Editor lock",
  ENERGY: "Energy",
  LAYOUT: "Layout",
  SETTINGS: "Settings",
  SUMMARY: "Summary",
} satisfies Record<WsChangeDomain, string>;

function assertNever(value: never): never {
  throw new Error(`Unhandled realtime event: ${JSON.stringify(value)}`);
}

export function formatRealtimeEventType(eventType: WsEventType): string {
  return EVENT_LABELS[eventType];
}

export function formatRealtimeDomain(changeDomain: WsChangeDomain): string {
  return DOMAIN_LABELS[changeDomain];
}

export function formatRealtimeEvent(event: WsEvent): RealtimeEventPresentation {
  const domainLabel = formatRealtimeDomain(event.change_domain);
  const sequenceSuffix = `#${event.sequence}`;

  switch (event.event_type) {
    case "backup_restore_completed":
      return {
        title: formatRealtimeEventType(event.event_type),
        domainLabel,
        subtitle: `${domainLabel} · ${event.payload.layout_version} · ${sequenceSuffix}`,
      };
    case "device_state_changed":
    case "media_state_changed":
      return {
        title: formatRealtimeEventType(event.event_type),
        domainLabel,
        subtitle: `${domainLabel} · ${event.payload.device_id} · ${event.payload.status ?? "pending"} · ${sequenceSuffix}`,
      };
    case "draft_lock_acquired":
      return {
        title: formatRealtimeEventType(event.event_type),
        domainLabel,
        subtitle: `${domainLabel} · ${event.payload.terminal_id} · ${sequenceSuffix}`,
      };
    case "energy_refresh_completed":
    case "energy_refresh_failed":
      return {
        title: formatRealtimeEventType(event.event_type),
        domainLabel,
        subtitle: `${domainLabel} · ${event.payload.refresh_status} · ${sequenceSuffix}`,
      };
    case "ha_sync_degraded":
    case "ha_sync_recovered":
      return {
        title: formatRealtimeEventType(event.event_type),
        domainLabel,
        subtitle: `${domainLabel} · ${event.payload.connection_status} · ${sequenceSuffix}`,
      };
    case "publish_succeeded":
      return {
        title: formatRealtimeEventType(event.event_type),
        domainLabel,
        subtitle: `${domainLabel} · ${event.payload.layout_version} · ${sequenceSuffix}`,
      };
    case "settings_updated":
      return {
        title: formatRealtimeEventType(event.event_type),
        domainLabel,
        subtitle: `${domainLabel} · ${event.payload.settings_version} · ${sequenceSuffix}`,
      };
    case "summary_updated":
      return {
        title: formatRealtimeEventType(event.event_type),
        domainLabel,
        subtitle: `${domainLabel} · ${event.payload.device_count} devices · ${sequenceSuffix}`,
      };
    case "version_conflict_detected":
      return {
        title: formatRealtimeEventType(event.event_type),
        domainLabel,
        subtitle: `${domainLabel} · ${event.payload.reason} · ${sequenceSuffix}`,
      };
    default:
      return assertNever(event);
  }
}
