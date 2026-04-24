import { EnergyDto } from "../../api/types";
import {
  formatSettingsStatus,
  getSettingsStatusTone,
} from "../../settings/statusFormat";
import { SettingsModuleCard } from "./SettingsModuleCard";

export type EnergyEntityMapKey =
  | "yesterday_usage"
  | "monthly_usage"
  | "balance"
  | "yearly_usage";

export interface EnergyBindingDraft {
  accountId: string;
  entityMap: Record<EnergyEntityMapKey, string>;
}

interface EnergyBindingPanelProps {
  canEdit: boolean;
  clearBusy: boolean;
  draft: EnergyBindingDraft;
  energy: EnergyDto | null;
  message: string | null;
  refreshBusy: boolean;
  saveBusy: boolean;
  sgccAccountCount: number;
  sgccLatestAccountTimestamp: string | null;
  sgccPhase: string;
  onChangeAccountId: (value: string) => void;
  onChangeEntity: (key: EnergyEntityMapKey, value: string) => void;
  onClear: () => void;
  onRefresh: () => void;
  onSave: () => void;
}

const ENTITY_FIELDS: Array<{
  key: EnergyEntityMapKey;
  label: string;
  placeholder: string;
}> = [
  {
    key: "yesterday_usage",
    label: "昨日用电实体",
    placeholder: "sensor.last_electricity_usage_xxxx",
  },
  {
    key: "monthly_usage",
    label: "本月累计实体",
    placeholder: "sensor.month_electricity_usage_xxxx",
  },
  {
    key: "balance",
    label: "账户余额实体",
    placeholder: "sensor.electricity_charge_balance_xxxx",
  },
  {
    key: "yearly_usage",
    label: "年度累计实体",
    placeholder: "sensor.yearly_electricity_usage_xxxx",
  },
];

function formatValue(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return String(value);
}

function formatEnergyValue(value: number | null | undefined, unit: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  return `${value} ${unit}`;
}

function formatTimestamp(value: string | null | undefined) {
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

function formatTaskTimestamp(value: string | null | undefined) {
  const formatted = formatTimestamp(value);
  return formatted === "-" ? "暂无记录" : formatted;
}

function formatStatus(energy: EnergyDto | null) {
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

function extractEntitySuffix(entityId: string | null | undefined) {
  if (!entityId) {
    return null;
  }
  const match = entityId.match(/_([A-Za-z0-9]+)$/);
  return match?.[1] ?? null;
}

function resolveEntitySuffix(
  energy: EnergyDto | null,
  draft: EnergyBindingDraft,
) {
  const source =
    energy?.entity_map?.balance ??
    energy?.entity_map?.monthly_usage ??
    draft.entityMap.balance ??
    draft.entityMap.monthly_usage;
  const suffix = extractEntitySuffix(source);
  return suffix ? `_${suffix}` : "-";
}

function formatSgccRuntimeStatus(energy: EnergyDto | null) {
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

function resolveEnergyTaskSteps(
  energy: EnergyDto | null,
  draft: EnergyBindingDraft,
  sgccPhase: string,
  sgccAccountCount: number,
  sgccLatestAccountTimestamp: string | null,
) {
  const bindingStatus = energy?.binding_status ?? "UNBOUND";
  const latestSourceAt = energy?.source_updated_at ?? energy?.system_updated_at ?? energy?.updated_at;
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
      tone: energy?.refresh_status === "FAILED" ? "danger" : latestSourceAt ? "success" : "neutral",
      value:
        energy?.refresh_status === "FAILED"
          ? formatStatus(energy)
          : formatTaskTimestamp(latestSourceAt),
    },
  ];
}

export function EnergyBindingPanel({
  canEdit,
  clearBusy,
  draft,
  energy,
  message,
  refreshBusy,
  saveBusy,
  sgccAccountCount,
  sgccLatestAccountTimestamp,
  sgccPhase,
  onChangeAccountId,
  onChangeEntity,
  onClear,
  onRefresh,
  onSave,
}: EnergyBindingPanelProps) {
  const taskSteps = resolveEnergyTaskSteps(
    energy,
    draft,
    sgccPhase,
    sgccAccountCount,
    sgccLatestAccountTimestamp,
  );
  return (
    <SettingsModuleCard
      description="按国网数据、账号缓存、能耗绑定、最近刷新四步检查首页能耗是否可用。"
      eyebrow="能耗"
      rows={[
        {
          label: "绑定状态",
          value: formatSettingsStatus(energy?.binding_status, "connection"),
        },
        { label: "刷新状态", value: formatStatus(energy) },
        { label: "数据源状态", value: formatSgccRuntimeStatus(energy) },
        { label: "绑定后缀", value: resolveEntitySuffix(energy, draft) },
        { label: "国网用户", value: formatValue(energy?.account_id_masked) },
        {
          label: "昨日用电",
          value: formatEnergyValue(energy?.yesterday_usage, "kWh"),
        },
        {
          label: "本月累计",
          value: formatEnergyValue(energy?.monthly_usage, "kWh"),
        },
        { label: "账户余额", value: formatEnergyValue(energy?.balance, "元") },
        {
          label: "年度累计",
          value: formatEnergyValue(energy?.yearly_usage, "kWh"),
        },
        {
          label: "系统刷新时间",
          value: formatTimestamp(energy?.system_updated_at ?? energy?.updated_at),
        },
        {
          label: "HA 源更新时间",
          value: formatTimestamp(energy?.source_updated_at),
        },
      ]}
      title="国家电网能耗"
    >
      <div className="settings-task-checklist" aria-label="能耗接入进度">
        {taskSteps.map((step) => (
          <div className="settings-task-checklist__item" key={step.label}>
            <span className={`settings-status-dot is-${step.tone}`} aria-hidden />
            <div>
              <span>{step.label}</span>
              <strong>{step.value}</strong>
            </div>
          </div>
        ))}
      </div>

      <div className="settings-form-grid settings-form-grid--two">
        <label className="form-field">
          <span>国网用户 ID / HA 实体后缀</span>
          <input
            className="control-input"
            disabled={!canEdit || saveBusy || clearBusy}
          onChange={(event) => onChangeAccountId(event.target.value)}
            placeholder="填写国网户号或实体后缀"
            value={draft.accountId}
          />
        </label>
        <label className="form-field">
          <span>数据源</span>
          <input
            className="control-input"
            disabled
            value={energy?.provider ? "国网缓存服务" : "待读取"}
          />
        </label>
      </div>
      <p className="settings-module-card__note">
        常规情况下只需要绑定国网账号并刷新能耗；实体映射保留给需要手动对齐
        Home Assistant 传感器的场景。
      </p>

      <details className="settings-advanced-fields">
        <summary>高级实体映射</summary>
        <div className="settings-form-grid settings-form-grid--two">
          {ENTITY_FIELDS.map((field) => (
            <label className="form-field" key={field.key}>
              <span>{field.label}</span>
              <input
                className="control-input"
                disabled={!canEdit || saveBusy || clearBusy}
                onChange={(event) => onChangeEntity(field.key, event.target.value)}
                placeholder={field.placeholder}
                value={draft.entityMap[field.key]}
              />
            </label>
          ))}
        </div>
      </details>

      <div className="settings-module-card__actions">
        <button
          className="button button--ghost"
          disabled={!canEdit || refreshBusy || saveBusy || clearBusy}
          onClick={onRefresh}
          type="button"
        >
          {refreshBusy ? "刷新中..." : "刷新能耗"}
        </button>
        <button
          className="button button--ghost"
          disabled={!canEdit || clearBusy || saveBusy}
          onClick={onClear}
          type="button"
        >
          {clearBusy ? "解绑中..." : "清除绑定"}
        </button>
        <button
          className="button button--primary"
          disabled={!canEdit || saveBusy || clearBusy}
          onClick={onSave}
          type="button"
        >
          {saveBusy ? "保存中..." : "保存能耗绑定"}
        </button>
      </div>
      {message ? <p className="inline-success">{message}</p> : null}
    </SettingsModuleCard>
  );
}
