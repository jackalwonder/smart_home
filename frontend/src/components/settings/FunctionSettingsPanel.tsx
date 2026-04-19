import { SettingsModuleCard } from "./SettingsModuleCard";

interface FunctionSettingsPanelProps {
  draft: {
    musicEnabled: boolean;
    lowBatteryThreshold: string;
    offlineThresholdSeconds: string;
    favoriteLimit: string;
    quickEntryFavorites: boolean;
    autoHomeTimeoutSeconds: string;
    closedMax: string;
    openedMin: string;
  };
  onChange: (
    field:
      | "musicEnabled"
      | "lowBatteryThreshold"
      | "offlineThresholdSeconds"
      | "favoriteLimit"
      | "quickEntryFavorites"
      | "autoHomeTimeoutSeconds"
      | "closedMax"
      | "openedMin",
    value: string | boolean,
  ) => void;
}

export function FunctionSettingsPanel({
  draft,
  onChange,
}: FunctionSettingsPanelProps) {
  return (
    <SettingsModuleCard
      description="这里控制首页入口显示规则、告警阈值以及自动返回逻辑。设备加入首页后，在首页入口管理里排序。"
      eyebrow="行为规则"
      title="功能策略"
    >
      <div className="settings-form-grid">
        <label className="toggle-field toggle-field--panel">
          <input
            checked={draft.musicEnabled}
            onChange={(event) => onChange("musicEnabled", event.target.checked)}
            type="checkbox"
          />
          <span>启用音乐能力</span>
        </label>
        <label className="toggle-field toggle-field--panel">
          <input
            checked={draft.quickEntryFavorites}
            onChange={(event) =>
              onChange("quickEntryFavorites", event.target.checked)
            }
            type="checkbox"
          />
          <span>首页显示常用设备入口</span>
        </label>
        <label className="form-field">
          <span>低电量阈值</span>
          <input
            className="control-input"
            onChange={(event) =>
              onChange("lowBatteryThreshold", event.target.value)
            }
            type="number"
            value={draft.lowBatteryThreshold}
          />
        </label>
        <label className="form-field">
          <span>离线判定秒数</span>
          <input
            className="control-input"
            onChange={(event) =>
              onChange("offlineThresholdSeconds", event.target.value)
            }
            type="number"
            value={draft.offlineThresholdSeconds}
          />
        </label>
        <label className="form-field">
          <span>首页常用设备上限</span>
          <input
            className="control-input"
            onChange={(event) => onChange("favoriteLimit", event.target.value)}
            type="number"
            value={draft.favoriteLimit}
          />
        </label>
        <label className="form-field">
          <span>自动回首页秒数</span>
          <input
            className="control-input"
            onChange={(event) =>
              onChange("autoHomeTimeoutSeconds", event.target.value)
            }
            type="number"
            value={draft.autoHomeTimeoutSeconds}
          />
        </label>
        <label className="form-field">
          <span>关闭阈值上限</span>
          <input
            className="control-input"
            onChange={(event) => onChange("closedMax", event.target.value)}
            type="number"
            value={draft.closedMax}
          />
        </label>
        <label className="form-field">
          <span>开启阈值下限</span>
          <input
            className="control-input"
            onChange={(event) => onChange("openedMin", event.target.value)}
            type="number"
            value={draft.openedMin}
          />
        </label>
      </div>
    </SettingsModuleCard>
  );
}
