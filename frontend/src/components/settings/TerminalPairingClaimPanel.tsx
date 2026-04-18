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
      description="After PIN verification, enter the one-time pairing code shown on the terminal. The terminal receives its bootstrap token automatically."
    >
      <ol className="delivery-steps" aria-label="Pairing claim steps">
        <li>
          <strong>Verify PIN</strong>
          <span>Confirm management access before claiming a terminal.</span>
        </li>
        <li>
          <strong>Enter code</strong>
          <span>Use the latest code shown on the unactivated terminal.</span>
        </li>
        <li>
          <strong>Confirm activation</strong>
          <span>The terminal signs in automatically after handoff.</span>
        </li>
      </ol>
      <label className="form-field">
        <span>Pairing code</span>
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
          {claimBusy ? "Claiming..." : "Claim pairing code"}
        </button>
      </div>
      {feedback ? (
        <p className={feedback.tone === "error" ? "inline-error" : "inline-success"}>
          {feedback.text}
        </p>
      ) : (
        <p className="muted-copy">
          Installation and recovery only. Codes are short-lived, single-use, and replaced when the
          terminal issues a new code.
        </p>
      )}
    </SettingsModuleCard>
  );
}
