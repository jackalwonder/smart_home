import { SettingsModuleCard } from "./SettingsModuleCard";

interface TerminalPairingClaimPanelProps {
  canEdit: boolean;
  claimBusy: boolean;
  feedback: { tone: "success" | "error"; text: string } | null;
  pairingCode: string;
  onChangePairingCode: (value: string) => void;
  onClaim: () => void;
}

export function TerminalPairingClaimPanel({
  canEdit,
  claimBusy,
  feedback,
  pairingCode,
  onChangePairingCode,
  onClaim,
}: TerminalPairingClaimPanelProps) {
  return (
    <SettingsModuleCard
      title="认领绑定码"
      eyebrow="新装终端"
      description="输入终端屏幕上的一次性绑定码。认领成功后，终端会自动完成激活并进入首页。"
    >
      <ol className="delivery-steps" aria-label="绑定码认领步骤">
        <li>
          <strong>确认现场终端</strong>
          <span>核对屏幕上的终端编号和绑定码，避免认领到错误设备。</span>
        </li>
        <li>
          <strong>输入绑定码</strong>
          <span>绑定码短时有效，只使用终端当前显示的最新一组。</span>
        </li>
        <li>
          <strong>等待自动激活</strong>
          <span>认领成功后，终端会自动领取激活凭据并上线。</span>
        </li>
      </ol>
      <label className="form-field">
        <span>绑定码</span>
        <input
          className="control-input pairing-claim-input"
          data-testid="pairing-claim-input"
          disabled={claimBusy}
          onChange={(event) => onChangePairingCode(event.target.value)}
          placeholder="ABCD-2345"
          type="text"
          value={pairingCode}
        />
      </label>
      <div className="settings-module-card__actions">
        <button
          className="button button--primary"
          data-testid="pairing-claim-submit"
          disabled={!canEdit || claimBusy || !pairingCode.trim()}
          onClick={onClaim}
          type="button"
        >
          {claimBusy ? "认领中..." : "认领绑定码"}
        </button>
      </div>
      {feedback ? (
        <p className={feedback.tone === "error" ? "inline-error" : "inline-success"}>
          {feedback.text}
        </p>
      ) : (
        <p className="muted-copy">
          仅用于新装或恢复现场。绑定码短时有效、一次性使用，终端刷新后旧码会失效。
        </p>
      )}
    </SettingsModuleCard>
  );
}
