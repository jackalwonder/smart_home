import type { EnergyDto, SgccLoginQrCodeStatusDto } from "../../api/types";
import { formatSettingsStatus, getSettingsStatusTone } from "../../settings/statusFormat";
import {
  formatEnergyValue,
  formatSgccRuntimeStatus,
  formatStatus,
  formatTimestamp,
  formatValue,
  resolveEntitySuffix,
  resolveEnergyTaskSteps,
} from "../../utils/energyBindingFormatting";
import type { EnergyBindingDraft, EnergyEntityMapKey } from "./EnergyBindingPanel";

interface SgccEnergySyncPanelProps {
  canEdit: boolean;
  clearBusy: boolean;
  draft: EnergyBindingDraft;
  energy: EnergyDto | null;
  energyMessage: string | null;
  imageUrl: string | null;
  loading: boolean;
  pullBusy: boolean;
  refreshBusy: boolean;
  regenerateBusy: boolean;
  saveBusy: boolean;
  sgccMessage: string | null;
  status: SgccLoginQrCodeStatusDto | null;
  onChangeAccountId: (value: string) => void;
  onChangeEntity: (key: EnergyEntityMapKey, value: string) => void;
  onClear: () => void;
  onPullEnergyData: () => void;
  onRefreshEnergy: () => void;
  onRefreshStatus: () => void;
  onRegenerate: () => void;
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
    label: "上月用电实体",
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

function currentPhase(status: SgccLoginQrCodeStatusDto | null) {
  return status?.phase ?? status?.status ?? "UNKNOWN";
}

function resolveLoginLabel(status: SgccLoginQrCodeStatusDto | null) {
  const phase = currentPhase(status);
  if (phase === "SESSION_READY") {
    return "已登录，等待拉取";
  }
  if (phase === "FETCHING_DATA") {
    return "正在拉取国网数据";
  }
  if (phase === "WAITING_FOR_SCAN" || phase === "QR_READY") {
    return "等待扫码登录";
  }
  if (phase === "DATA_READY" || phase === "BOUND") {
    return "已登录";
  }
  if (phase === "FAILED" || status?.last_error === "LOGIN_REQUIRED") {
    return "登录态失效，请重新扫码";
  }
  return formatSettingsStatus(phase, "sgcc");
}

function resolveSyncLabel(status: SgccLoginQrCodeStatusDto | null, energy: EnergyDto | null) {
  const phase = currentPhase(status);
  if (phase === "FETCHING_DATA") {
    return "正在拉取国网数据";
  }
  if (energy?.refresh_status === "SUCCESS") {
    return energy.cache_mode ? "已生成缓存快照" : "已同步到 HA";
  }
  if (energy?.refresh_status === "FAILED") {
    return "同步失败";
  }
  if (phase === "DATA_READY" || phase === "BOUND") {
    return "已同步到 HA";
  }
  return "未拉取";
}

function resolveSourceLabel(energy: EnergyDto | null) {
  if (energy?.refresh_status !== "SUCCESS") {
    return "暂无数据";
  }
  return energy.cache_mode ? "从 SGCC 缓存读取" : "从 HA 实体读取";
}

function canPullEnergy(status: SgccLoginQrCodeStatusDto | null) {
  const phase = currentPhase(status);
  return ["SESSION_READY", "DATA_READY", "BOUND"].includes(phase);
}

export function SgccEnergySyncPanel({
  canEdit,
  clearBusy,
  draft,
  energy,
  energyMessage,
  imageUrl,
  loading,
  pullBusy,
  refreshBusy,
  regenerateBusy,
  saveBusy,
  sgccMessage,
  status,
  onChangeAccountId,
  onChangeEntity,
  onClear,
  onPullEnergyData,
  onRefreshEnergy,
  onRefreshStatus,
  onRegenerate,
  onSave,
}: SgccEnergySyncPanelProps) {
  const phase = currentPhase(status);
  const busy = loading || regenerateBusy || pullBusy || refreshBusy || saveBusy || clearBusy;
  const taskSteps = resolveEnergyTaskSteps(
    energy,
    draft,
    phase,
    status?.account_count ?? 0,
    status?.latest_account_timestamp ?? null,
  );

  return (
    <div className="settings-section-stack">
      <div className={`sgcc-status-banner is-${getSettingsStatusTone(phase, "sgcc")}`}>
        <div>
          <span className="card-eyebrow">登录状态</span>
          <strong>{resolveLoginLabel(status)}</strong>
          <p>{status?.message ?? "等待国家电网登录状态。"}</p>
        </div>
        <dl>
          <div>
            <dt>数据同步</dt>
            <dd>{resolveSyncLabel(status, energy)}</dd>
          </div>
          <div>
            <dt>数据来源</dt>
            <dd>{resolveSourceLabel(energy)}</dd>
          </div>
          <div>
            <dt>发现账号</dt>
            <dd>{status?.account_count ?? 0} 个</dd>
          </div>
        </dl>
      </div>

      <div className="settings-form-grid settings-form-grid--two">
        <section className="sgcc-login-qrcode" aria-label="国家电网登录二维码">
          {imageUrl ? (
            <img alt="国家电网登录二维码" className="sgcc-login-qrcode__image" src={imageUrl} />
          ) : (
            <div className="sgcc-login-qrcode__empty">
              {status?.message ?? "点击重新生成二维码后，等待二维码出现在这里。"}
            </div>
          )}
          <div className="sgcc-login-qrcode__copy">
            <p className="settings-module-card__note">
              二维码只负责登录。扫码成功后不会自动拉取能耗，请点击右侧的拉取按钮。
            </p>
            <p className="settings-module-card__note">
              手动刷新能耗只读取 HA 实体，缺失时使用 SGCC 缓存兜底。
            </p>
          </div>
        </section>

        <section className="settings-section-stack" aria-label="国家电网能耗操作">
          <dl className="field-grid">
            <div>
              <dt>昨日用电</dt>
              <dd>{formatEnergyValue(energy?.yesterday_usage, "kWh")}</dd>
            </div>
            <div>
              <dt>上月用电</dt>
              <dd>{formatEnergyValue(energy?.monthly_usage, "kWh")}</dd>
            </div>
            <div>
              <dt>账户余额</dt>
              <dd>{formatEnergyValue(energy?.balance, "元")}</dd>
            </div>
            <div>
              <dt>年度累计</dt>
              <dd>{formatEnergyValue(energy?.yearly_usage, "kWh")}</dd>
            </div>
            <div>
              <dt>能耗状态</dt>
              <dd>{formatStatus(energy)}</dd>
            </div>
            <div>
              <dt>源数据时间</dt>
              <dd>{formatTimestamp(energy?.source_updated_at)}</dd>
            </div>
          </dl>

          <div className="settings-task-checklist" aria-label="国家电网同步进度">
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

          <div className="settings-module-card__actions">
            <button
              className="button button--ghost"
              disabled={busy}
              onClick={onRefreshStatus}
              type="button"
            >
              {loading ? "刷新中..." : "刷新状态"}
            </button>
            <button
              className="button button--ghost"
              disabled={!canEdit || busy}
              onClick={onRegenerate}
              type="button"
            >
              {regenerateBusy ? "生成中..." : "重新生成二维码"}
            </button>
            <button
              className="button button--primary"
              disabled={!canEdit || busy || !canPullEnergy(status)}
              onClick={onPullEnergyData}
              type="button"
            >
              {pullBusy ? "拉取中..." : "拉取国网能耗"}
            </button>
            <button
              className="button button--ghost"
              disabled={!canEdit || busy}
              onClick={onRefreshEnergy}
              type="button"
            >
              {refreshBusy ? "刷新中..." : "刷新能耗"}
            </button>
          </div>
        </section>
      </div>

      <details className="settings-advanced-fields">
        <summary>高级实体映射</summary>
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
            <span>当前绑定后缀</span>
            <input className="control-input" disabled value={resolveEntitySuffix(energy, draft)} />
          </label>
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
        <dl className="field-grid">
          <div>
            <dt>绑定状态</dt>
            <dd>{formatSettingsStatus(energy?.binding_status, "connection")}</dd>
          </div>
          <div>
            <dt>国网用户</dt>
            <dd>{formatValue(energy?.account_id_masked)}</dd>
          </div>
          <div>
            <dt>数据源状态</dt>
            <dd>{formatSgccRuntimeStatus(energy)}</dd>
          </div>
          <div>
            <dt>最近系统刷新</dt>
            <dd>{formatTimestamp(energy?.system_updated_at ?? energy?.updated_at)}</dd>
          </div>
        </dl>
        <div className="settings-module-card__actions">
          <button
            className="button button--ghost"
            disabled={!canEdit || clearBusy || saveBusy}
            onClick={onClear}
            type="button"
          >
            {clearBusy ? "清除中..." : "清除绑定"}
          </button>
          <button
            className="button button--primary"
            disabled={!canEdit || saveBusy || clearBusy}
            onClick={onSave}
            type="button"
          >
            {saveBusy ? "保存中..." : "保存实体映射"}
          </button>
        </div>
      </details>

      {sgccMessage ? <p className="inline-error">{sgccMessage}</p> : null}
      {energyMessage ? <p className="inline-success">{energyMessage}</p> : null}
      {!canEdit ? <p className="inline-error">操作国家电网同步前，请先验证管理 PIN。</p> : null}
    </div>
  );
}
