import { EnergyDto } from "../../api/types";
import { SettingsModuleCard } from "./SettingsModuleCard";

interface EnergyBindingPanelProps {
  canEdit: boolean;
  clearBusy: boolean;
  draftPayloadText: string;
  energy: EnergyDto | null;
  message: string | null;
  refreshBusy: boolean;
  saveBusy: boolean;
  onChangePayload: (value: string) => void;
  onClear: () => void;
  onRefresh: () => void;
  onSave: () => void;
}

function formatValue(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return String(value);
}

export function EnergyBindingPanel({
  canEdit,
  clearBusy,
  draftPayloadText,
  energy,
  message,
  refreshBusy,
  saveBusy,
  onChangePayload,
  onClear,
  onRefresh,
  onSave,
}: EnergyBindingPanelProps) {
  return (
    <SettingsModuleCard
      description="保存能耗账户绑定信息，并在需要时触发一次刷新。"
      eyebrow="能耗"
      rows={[
        { label: "绑定状态", value: formatValue(energy?.binding_status) },
        { label: "刷新状态", value: formatValue(energy?.refresh_status) },
        { label: "余额", value: formatValue(energy?.balance) },
        { label: "最近更新时间", value: formatValue(energy?.updated_at) },
      ]}
      title="能耗管理"
    >
      <label className="form-field">
        <span>绑定负载 JSON</span>
        <textarea
          className="control-input settings-textarea"
          onChange={(event) => onChangePayload(event.target.value)}
          placeholder='{"account_id":"demo","provider":"utility"}'
          rows={5}
          value={draftPayloadText}
        />
      </label>
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
