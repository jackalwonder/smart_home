import type { ReactNode } from "react";

interface SettingsPinGateProps {
  onToggle: () => void;
  pinAccessPanel: ReactNode;
  pinActive: boolean;
  showPinManager: boolean;
}

export function SettingsPinGate({
  onToggle,
  pinAccessPanel,
  pinActive,
  showPinManager,
}: SettingsPinGateProps) {
  if (pinActive && !showPinManager) {
    return null;
  }

  return (
    <section className="utility-card settings-inline-pin settings-inline-pin--compact">
      <div className="settings-inline-pin__header">
        <div>
          <span className="card-eyebrow">权限提示</span>
          <h3>{pinActive ? "管理 PIN 已验证" : "部分管理能力需要 PIN"}</h3>
          <p className="muted-copy">
            {pinActive
              ? "当前会话已经具备管理权限，如需查看有效期或重新验证，可以展开 PIN 面板。"
              : "部分管理动作需要 PIN。"}
          </p>
        </div>
        <button className="button button--ghost" onClick={onToggle} type="button">
          {showPinManager ? "收起 PIN 面板" : "验证 PIN"}
        </button>
      </div>
      {showPinManager ? pinAccessPanel : null}
    </section>
  );
}
