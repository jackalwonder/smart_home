import type { WsChangeDomain, WsEvent, WsEventType } from "./types";

export interface RealtimeEventPresentation {
  title: string;
  domainLabel: string;
  subtitle: string;
}

const EVENT_LABELS = {
  backup_restore_completed: "恢复完成",
  device_state_changed: "设备状态更新",
  draft_lock_acquired: "编辑锁已获取",
  draft_lock_lost: "编辑锁已丢失",
  draft_taken_over: "编辑锁被接管",
  energy_refresh_completed: "能耗已刷新",
  energy_refresh_failed: "能耗刷新失败",
  ha_sync_degraded: "HA 同步降级",
  ha_sync_recovered: "HA 同步恢复",
  media_state_changed: "媒体状态更新",
  publish_succeeded: "户型已发布",
  settings_updated: "设置已更新",
  summary_updated: "总览摘要已刷新",
  version_conflict_detected: "发现版本冲突",
} satisfies Record<WsEventType, string>;

const DOMAIN_LABELS = {
  BACKUP: "备份恢复",
  DEVICE_STATE: "设备",
  EDITOR_LOCK: "编辑会话",
  ENERGY: "能耗",
  LAYOUT: "户型",
  SETTINGS: "设置",
  SUMMARY: "总览",
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
  switch (event.event_type) {
    case "backup_restore_completed":
      return {
        title: formatRealtimeEventType(event.event_type),
        domainLabel,
        subtitle: `恢复到版本 ${event.payload.layout_version}`,
      };
    case "device_state_changed":
    case "media_state_changed":
      return {
        title: formatRealtimeEventType(event.event_type),
        domainLabel,
        subtitle: `${event.payload.device_id} 状态变更为 ${event.payload.status ?? "待确认"}`,
      };
    case "draft_lock_acquired":
      return {
        title: formatRealtimeEventType(event.event_type),
        domainLabel,
        subtitle: `终端 ${event.payload.terminal_id} 已接管编辑锁`,
      };
    case "draft_lock_lost":
      return {
        title: formatRealtimeEventType(event.event_type),
        domainLabel,
        subtitle: `终端 ${event.payload.terminal_id} 丢失编辑锁：${event.payload.lost_reason}`,
      };
    case "draft_taken_over":
      return {
        title: formatRealtimeEventType(event.event_type),
        domainLabel,
        subtitle: `由 ${event.payload.previous_terminal_id} 切换到 ${event.payload.new_terminal_id}`,
      };
    case "energy_refresh_completed":
    case "energy_refresh_failed":
      return {
        title: formatRealtimeEventType(event.event_type),
        domainLabel,
        subtitle: `刷新状态：${event.payload.refresh_status}`,
      };
    case "ha_sync_degraded":
    case "ha_sync_recovered":
      return {
        title: formatRealtimeEventType(event.event_type),
        domainLabel,
        subtitle: `当前连接状态：${event.payload.connection_status}`,
      };
    case "publish_succeeded":
      return {
        title: formatRealtimeEventType(event.event_type),
        domainLabel,
        subtitle: `已发布版本 ${event.payload.layout_version}`,
      };
    case "settings_updated":
      return {
        title: formatRealtimeEventType(event.event_type),
        domainLabel,
        subtitle: `设置版本更新到 ${event.payload.settings_version}`,
      };
    case "summary_updated":
      return {
        title: formatRealtimeEventType(event.event_type),
        domainLabel,
        subtitle: `当前汇总设备数 ${event.payload.device_count}`,
      };
    case "version_conflict_detected":
      return {
        title: formatRealtimeEventType(event.event_type),
        domainLabel,
        subtitle: `原因：${event.payload.reason}`,
      };
    default:
      return assertNever(event);
  }
}
