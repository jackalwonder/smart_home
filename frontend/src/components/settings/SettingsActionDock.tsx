interface SettingsActionDockProps {
  canSave: boolean;
  saving: boolean;
  version: string;
  pinRequired: boolean;
  onSave: () => void;
  saveMessage: string | null;
}

export function SettingsActionDock({
  canSave,
  saving,
  version,
  pinRequired,
  onSave,
  saveMessage,
}: SettingsActionDockProps) {
  return (
    <section className="utility-card settings-action-dock">
      <span className="card-eyebrow">操作区</span>
      <h3>保存中控设置</h3>
      <p className="muted-copy">
        当前版本 {version}。系统连接在“基础设施”面板内单独保存。{" "}
        {pinRequired ? "保存前需要管理 PIN。" : "当前允许直接保存。"}
      </p>
      <button
        className="button button--primary"
        disabled={!canSave || saving}
        onClick={onSave}
        type="button"
      >
        {saving ? "保存中..." : "保存全部"}
      </button>
      {saveMessage ? <p className="inline-success">{saveMessage}</p> : null}
    </section>
  );
}
