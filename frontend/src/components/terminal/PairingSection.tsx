import {
  buildPairingStages,
  formatDateTime,
  formatRemainingDuration,
  pairingStatusSummary,
  statusTone,
} from "../../pages/terminalActivationModel";
import type { TerminalPairingIssueDto } from "../../api/types";

interface PairingSectionProps {
  expiresInSeconds: number;
  pairingBusy: boolean;
  pairingClaimedAt: string | null;
  pairingError: string | null;
  pairingSession: TerminalPairingIssueDto | null;
  pairingStatus: string | null;
  pairingTokenExpiresAt: string | null;
  refreshCooldownSeconds: number;
  terminalId: string;
  onRefreshPairing: () => Promise<void>;
}

export function PairingSection({
  expiresInSeconds,
  pairingBusy,
  pairingClaimedAt,
  pairingSession,
  pairingStatus,
  pairingTokenExpiresAt,
  refreshCooldownSeconds,
  terminalId,
  onRefreshPairing,
}: PairingSectionProps) {
  const pairingSummary = pairingStatusSummary(pairingStatus);
  const pairingStages = buildPairingStages(pairingStatus);
  const pairingCode =
    pairingSession?.pairing_code ?? (pairingBusy ? "Loading..." : "--");

  return (
    <section
      className="terminal-activation__entry terminal-activation__entry--pairing"
      aria-labelledby="pairing-title"
    >
      <div className="terminal-activation__entry-header">
        <div>
          <span className="terminal-activation__entry-tag">现场认领</span>
          <h2 id="pairing-title">等待绑定码认领</h2>
        </div>
        <span
          className={`terminal-activation__entry-badge is-${statusTone(pairingStatus)}`}
        >
          {pairingSummary.hint}
        </span>
      </div>
      <p className="terminal-activation__entry-copy">
        适合新装终端。管理端在"设置 &gt; 终端交付"输入这串绑定码后，当前终端会自动完成激活。
      </p>
      <p className="terminal-activation__legacy-note">Claim this code from Pairing claim.</p>

      <div className="terminal-activation__pairing-grid">
        <div className="terminal-activation__pairing-code">
          <span className="terminal-activation__pairing-label">绑定码</span>
          <strong data-testid="pairing-code-value">{pairingCode}</strong>
        </div>
        <div
          className={`terminal-activation__pairing-meta is-${statusTone(pairingStatus)}`}
        >
          <span>当前状态</span>
          <strong data-testid="pairing-status-value">{pairingSummary.label}</strong>
          <small>{pairingSummary.detail}</small>
        </div>
        <div className="terminal-activation__pairing-meta">
          <span>剩余有效期</span>
          <strong>{formatRemainingDuration(expiresInSeconds)}</strong>
          <small>{formatDateTime(pairingSession?.expires_at)}</small>
        </div>
        <div className="terminal-activation__pairing-meta">
          <span>刷新节流</span>
          <strong>
            {refreshCooldownSeconds > 0
              ? `${refreshCooldownSeconds} 秒后可刷新`
              : "现在可刷新"}
          </strong>
          <small>避免现场误刷导致绑定码频繁变化</small>
        </div>
      </div>

      <div className="terminal-activation__status-rail" aria-label="绑定状态轨迹">
        {pairingStages.map((stage) => (
          <span
            className={`terminal-activation__status-chip is-${stage.state}`}
            key={stage.label}
          >
            {stage.label}
          </span>
        ))}
      </div>

      <ol className="terminal-activation__steps" aria-label="现场认领步骤">
        <li className="terminal-activation__legacy-step">Verify management PIN.</li>
        <li>管理端进入 设置 &gt; 终端交付。</li>
        <li>管理人员输入管理 PIN，确认有权限操作。</li>
        <li>在绑定码认领里输入当前绑定码，终端会自动激活。</li>
      </ol>

      <dl className="terminal-activation__pairing-timeline">
        <div>
          <dt>认领时间</dt>
          <dd>{formatDateTime(pairingClaimedAt)}</dd>
        </div>
        <div>
          <dt>凭证有效期</dt>
          <dd>{formatDateTime(pairingTokenExpiresAt)}</dd>
        </div>
        <div>
          <dt>终端标识</dt>
          <dd>{terminalId || "未配置"}</dd>
        </div>
      </dl>

      <div className="terminal-activation__entry-actions">
        <span className="terminal-activation__entry-hint">
          如果现场已经换机或恢复，优先使用上面的扫码激活或激活码入口。
        </span>
        <button
          className="button button--ghost"
          disabled={pairingBusy || refreshCooldownSeconds > 0}
          onClick={() => void onRefreshPairing()}
          type="button"
        >
          {pairingBusy
            ? "正在刷新..."
            : refreshCooldownSeconds > 0
              ? `${refreshCooldownSeconds} 秒后可刷新`
              : "刷新绑定码"}
        </button>
      </div>
    </section>
  );
}
