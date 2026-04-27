import type { EnergyDto } from "../api/types";
import { formatSettingsStatus, getSettingsStatusTone } from "../settings/statusFormat";
import type { EnergyBindingDraft, EnergyEntityMapKey } from "../components/settings/EnergyBindingPanel";

export function formatValue(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return String(value);
}

export function formatEnergyValue(value: number | null | undefined, unit: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  return `${value} ${unit}`;
}

export function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  const hour = String(parsed.getHours()).padStart(2, "0");
  const minute = String(parsed.getMinutes()).padStart(2, "0");
  return `${parsed.getMonth() + 1}月${parsed.getDate()}日 ${hour}:${minute}`;
}

export function formatTaskTimestamp(value: string | null | undefined) {
  const formatted = formatTimestamp(value);
  return formatted === "-" ? "暂无记录" : formatted;
}

export function formatStatus(energy: EnergyDto | null) {
  const detail = energy?.refresh_status_detail;
  if (detail === "SUCCESS_UPDATED") {
    return "已刷新，HA 源已更新";
  }
  if (detail === "SUCCESS_STALE_SOURCE") {
    return "已刷新，HA 源未更新";
  }
  if (detail === "FAILED_UPSTREAM_TRIGGER") {
    return "触发上游同步失败";
  }
  if (detail === "FAILED_SOURCE_TIMEOUT") {
    return "等待 HA 源更新超时";
  }
  if (!energy?.last_error_code) {
    return formatSettingsStatus(energy?.refresh_status, "connection");
  }
  return `${formatSettingsStatus(energy.refresh_status, "connection")} / ${
    energy.last_error_code
  }`;
}

export function extractEntitySuffix(entityId: string | null | undefined) {
  if (!entityId) {
    return null;
  }
  const match = entityId.match(/_([A-Za-z0-9]+)$/);
  return match?.[1] ?? null;
}

export function resolveEntitySuffix(energy: EnergyDto | null, draft: EnergyBindingDraft) {
  const source =
    energy?.entity_map?.balance ??
    energy?.entity_map?.monthly_usage ??
    draft.entityMap.balance ??
    draft.entityMap.monthly_usage;
  const suffix = extractEntitySuffix(source);
  return suffix ? `_${suffix}` : "-";
}

export function formatSgccRuntimeStatus(energy: EnergyDto | null) {
  if (energy?.binding_status !== "BOUND") {
    return "待绑定";
  }
  if (energy?.refresh_status === "SUCCESS" && energy.cache_mode) {
    return energy.refresh_status_detail === "SUCCESS_STALE_SOURCE"
      ? "已读取缓存，源数据暂未更新"
      : "已从缓存同步";
  }
  if (energy?.refresh_status_detail === "SUCCESS_STALE_SOURCE") {
    return "已触发同步，源数据暂未更新";
  }
  if (energy?.refresh_status === "SUCCESS") {
    return "同步正常";
  }
  if (energy?.refresh_status === "FAILED") {
    return "同步失败";
  }
  return "已绑定，等待首次同步";
}

export function resolveEnergyTaskSteps(
  energy: EnergyDto | null,
  draft: EnergyBindingDraft,
  sgccPhase: string,
  sgccAccountCount: number,
  sgccLatestAccountTimestamp: string | null,
) {
  const bindingStatus = energy?.binding_status ?? "UNBOUND";
  const latestSourceAt =
    energy?.source_updated_at ?? energy?.system_updated_at ?? energy?.updated_at;
  return [
    {
      label: "国网数据",
      tone: getSettingsStatusTone(sgccPhase, "sgcc"),
      value:
        sgccPhase === "DATA_READY"
          ? `已就绪${sgccLatestAccountTimestamp ? `，${formatTaskTimestamp(sgccLatestAccountTimestamp)}` : ""}`
          : formatSettingsStatus(sgccPhase, "sgcc"),
    },
    {
      label: "账号缓存",
      tone: sgccAccountCount > 0 ? "success" : "warning",
      value: sgccAccountCount > 0 ? `已发现 ${sgccAccountCount} 个账号` : "未发现账号",
    },
    {
      label: "能耗绑定",
      tone: getSettingsStatusTone(bindingStatus, "connection"),
      value:
        bindingStatus === "BOUND"
          ? `已绑定${resolveEntitySuffix(energy, draft) !== "-" ? ` ${resolveEntitySuffix(energy, draft)}` : ""}`
          : formatSettingsStatus(bindingStatus, "connection"),
    },
    {
      label: "最近刷新",
      tone:
        energy?.refresh_status === "FAILED"
          ? "danger"
          : latestSourceAt
            ? "success"
            : "neutral",
      value:
        energy?.refresh_status === "FAILED"
          ? formatStatus(energy)
          : formatTaskTimestamp(latestSourceAt),
    },
  ];
}
