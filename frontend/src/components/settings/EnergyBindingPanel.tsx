import { EnergyDto } from "../../api/types";
import { formatSettingsStatus } from "../../settings/statusFormat";
import {
  formatEnergyValue,
  formatSgccRuntimeStatus,
  formatStatus,
  formatTimestamp,
  formatValue,
  resolveEntitySuffix,
  resolveEnergyTaskSteps,
} from "../../utils/energyBindingFormatting";
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
        常规情况下只需要绑定国网账号并刷新能耗；实体映射保留给需要手动对齐 Home Assistant
        传感器的场景。
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
