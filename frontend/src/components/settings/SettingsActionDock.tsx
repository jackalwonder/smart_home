interface SettingsActionDockProps {
  canSave: boolean;
  saving: boolean;
  version: string;
  pinRequired: boolean;
  pinActive?: boolean;
  onSave: () => void;
  saveMessage: string | null;
  onManagePin?: () => void;
  variant?: "default" | "compact";
}

export function SettingsActionDock({
  canSave,
  saving,
  version,
  pinRequired,
  pinActive = false,
  onSave,
  saveMessage,
  onManagePin,
  variant = "default",
}: SettingsActionDockProps) {
  const isCompact = variant === "compact";

  return (
    <section
      className={
        isCompact
          ? "utility-card settings-action-dock settings-action-dock--compact"
          : "utility-card settings-action-dock"
      }
    >
      <div className="settings-action-dock__copy">
        <span className="card-eyebrow">操作区</span>
        <h3>{isCompact ? "保存当前分区设置" : "保存中控设置"}</h3>
        <p className="muted-copy">
          当前版本 {version}。
          {pinRequired ? "保存前需要管理 PIN。" : "当前允许直接保存。"}
        </p>
      </div>
      <div className="settings-action-dock__meta">
        <span className="state-chip">{pinActive ? "PIN 已验证" : "PIN 待验证"}</span>
        {saveMessage ? <span className="state-chip">{saveMessage}</span> : null}
      </div>
      <div className="settings-action-dock__actions">
        {onManagePin ? (
          <button className="button button--ghost" onClick={onManagePin} type="button">
            {pinActive ? "查看 PIN" : "验证 PIN"}
          </button>
        ) : null}
        <button
          className="button button--primary"
          disabled={!canSave || saving}
          onClick={onSave}
          type="button"
        >
          {saving ? "保存中..." : "保存全部"}
        </button>
      </div>
    </section>
  );
}
