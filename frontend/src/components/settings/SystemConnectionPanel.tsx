import { SettingsModuleCard } from "./SettingsModuleCard";

interface SystemConnectionPanelProps {
  draft: {
    connectionMode: string;
    baseUrl: string;
    accessToken: string;
    baseUrlMasked: string | null;
    connectionStatus: string;
    authConfigured: boolean;
    lastTestAt: string | null;
    lastTestResult: string | null;
    lastSyncAt: string | null;
    lastSyncResult: string | null;
  };
  canEdit: boolean;
  saveBusy: boolean;
  testBusy: boolean;
  message: string | null;
  onChange: (field: "connectionMode" | "baseUrl" | "accessToken", value: string) => void;
  onSave: () => void;
  onTestCandidate: () => void;
  onTestSaved: () => void;
}

export function SystemConnectionPanel({
  draft,
  canEdit,
  saveBusy,
  testBusy,
  message,
  onChange,
  onSave,
  onTestCandidate,
  onTestSaved,
}: SystemConnectionPanelProps) {
  return (
    <SettingsModuleCard
      description="中控依赖的 Home Assistant、天气、能耗和媒体服务都从这里接入。"
      eyebrow="基础设施"
      title="系统连接"
    >
      <div className="settings-form-grid">
        <label className="form-field">
          <span>连接方式</span>
          <select
            className="control-input"
            onChange={(event) => onChange("connectionMode", event.target.value)}
            value={draft.connectionMode}
          >
            <option value="TOKEN">令牌</option>
          </select>
        </label>
        <label className="form-field">
          <span>当前状态</span>
          <input
            className="control-input"
            readOnly
            value={`${draft.connectionStatus} · 认证${draft.authConfigured ? "已配置" : "待配置"}`}
          />
        </label>
        <label className="form-field form-field--full">
          <span>Home Assistant 地址</span>
          <input
            className="control-input"
            onChange={(event) => onChange("baseUrl", event.target.value)}
            placeholder={draft.baseUrlMasked ?? "http://homeassistant:8123"}
            value={draft.baseUrl}
          />
        </label>
        <label className="form-field form-field--full">
          <span>长期访问令牌</span>
          <input
            className="control-input"
            onChange={(event) => onChange("accessToken", event.target.value)}
            placeholder={draft.authConfigured ? "当前已配置令牌，如需更换可重新输入。" : "粘贴访问令牌"}
            type="password"
            value={draft.accessToken}
          />
        </label>
      </div>
      <dl className="field-grid">
        <div>
          <dt>最近测试</dt>
          <dd>{draft.lastTestAt ?? "-"}</dd>
        </div>
        <div>
          <dt>测试结果</dt>
          <dd>{draft.lastTestResult ?? "-"}</dd>
        </div>
        <div>
          <dt>最近同步</dt>
          <dd>{draft.lastSyncAt ?? "-"}</dd>
        </div>
        <div>
          <dt>同步结果</dt>
          <dd>{draft.lastSyncResult ?? "-"}</dd>
        </div>
      </dl>
      <div className="settings-module-card__actions">
        <button
          className="button button--ghost"
          disabled={!canEdit || testBusy}
          onClick={onTestSaved}
          type="button"
        >
          {testBusy ? "测试中..." : "测试已保存配置"}
        </button>
        <button
          className="button button--ghost"
          disabled={!canEdit || testBusy}
          onClick={onTestCandidate}
          type="button"
        >
          {testBusy ? "测试中..." : "测试当前输入"}
        </button>
        <button
          className="button button--primary"
          disabled={!canEdit || saveBusy}
          onClick={onSave}
          type="button"
        >
          {saveBusy ? "保存中..." : "保存连接"}
        </button>
      </div>
      {message ? <p className="inline-success">{message}</p> : null}
    </SettingsModuleCard>
  );
}
