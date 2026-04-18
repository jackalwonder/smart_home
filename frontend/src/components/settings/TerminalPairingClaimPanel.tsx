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
      title="Pairing claim"
      eyebrow="Terminal install"
      description="Enter the one-time pairing code shown on an unactivated terminal. The terminal will receive a bootstrap token automatically."
    >
      <label className="form-field">
        <span>Pairing code</span>
        <input
          className="control-input"
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
          {claimBusy ? "Claiming..." : "Claim pairing code"}
        </button>
      </div>
      {feedback ? (
        <p className={feedback.tone === "error" ? "inline-error" : "inline-success"}>
          {feedback.text}
        </p>
      ) : (
        <p className="muted-copy">
          This is meant for installation and recovery. Each pairing code can be claimed once.
        </p>
      )}
    </SettingsModuleCard>
  );
}
