import {
  buildPairingStages,
  completionCopy,
  entryTitle,
  formatDateTime,
  formatRemainingDuration,
  pairingStatusSummary,
  statusTone,
  type TerminalActivationEntryMode,
  type TerminalActivationSuccessState,
} from "./terminalActivationModel";
import { useTerminalActivationFlow } from "./useTerminalActivationFlow";

export type { TerminalActivationEntryMode, TerminalActivationSuccessState };

interface TerminalActivationPageProps {
  terminalId: string;
  error: string | null;
  loading: boolean;
  onActivate: (
    bootstrapToken: string,
    mode: TerminalActivationEntryMode,
  ) => Promise<void>;
  onContinueAfterSuccess: () => void;
  successState: TerminalActivationSuccessState | null;
}

export function TerminalActivationPage({
  terminalId,
  error,
  loading,
  onActivate,
  onContinueAfterSuccess,
  successState,
}: TerminalActivationPageProps) {
  const flow = useTerminalActivationFlow({
    loading,
    onActivate,
    successState,
    terminalId,
  });
  const displayError = flow.localError ?? flow.pairingError ?? error;
  const pairingSummary = pairingStatusSummary(flow.pairingStatus);
  const pairingStages = buildPairingStages(flow.pairingStatus);
  const pairingCode =
    flow.pairingSession?.pairing_code ?? (flow.pairingBusy ? "Loading..." : "--");
  const successCopy = successState ? completionCopy(successState.mode) : null;

  return (
    <main className="terminal-activation">
      <section className="terminal-activation__panel" aria-labelledby="terminal-activation-title">
        <div className="terminal-activation__visual" aria-hidden="true">
          <div className="terminal-activation__screen">
            <span />
            <span />
            <span />
          </div>
          <div className="terminal-activation__base" />
          <div className="terminal-activation__visual-copy">
            <strong>激活完成后自动进入首页</strong>
            <span>后续管理入口在 设置 &gt; 终端交付</span>
          </div>
        </div>

        <div className="terminal-activation__copy">
          <span className="card-eyebrow">终端交付</span>
          <h1 id="terminal-activation-title">激活这台中控</h1>
          <p>
            新装终端优先用扫码或绑定码认领，换机、重装和恢复可以直接输入激活码。终端激活成功后会直接进入首页。
          </p>
          <p className="terminal-activation__legacy-note">Activate this terminal with a pairing code</p>
          <dl className="terminal-activation__summary">
            <div>
              <dt>终端 ID</dt>
              <dd data-testid="pairing-terminal-id">{terminalId || "未配置"}</dd>
            </div>
            <div>
              <dt>现场入口</dt>
              <dd>扫码激活 / 输入激活码 / 等待绑定码认领</dd>
            </div>
            <div>
              <dt>进入位置</dt>
              <dd>首页</dd>
            </div>
          </dl>
          {displayError ? (
            <p className="terminal-activation__alert is-warning" role="alert">
              {displayError}
            </p>
          ) : (
            <p className="terminal-activation__alert">
              保持当前页面打开，现场管理端完成认领后，终端会自动继续。
            </p>
          )}
        </div>

        {successState && successCopy ? (
          <section
            className="terminal-activation__success"
            aria-labelledby="terminal-activation-success-title"
          >
            <span className="terminal-activation__success-pill">已完成激活</span>
            <h2 id="terminal-activation-success-title">{successCopy.title}</h2>
            <p>{successCopy.detail}</p>
            <dl className="terminal-activation__success-meta">
              <div>
                <dt>完成入口</dt>
                <dd>{entryTitle(successState.mode)}</dd>
              </div>
              <div>
                <dt>即将进入</dt>
                <dd>{successState.destinationLabel}</dd>
              </div>
              <div>
                <dt>后续操作</dt>
                <dd>设置 &gt; 终端交付</dd>
              </div>
            </dl>
            <button className="button button--primary" onClick={onContinueAfterSuccess} type="button">
              进入首页
            </button>
          </section>
        ) : (
          <div className="terminal-activation__entries">
            <form
              className="terminal-activation__entry"
              onSubmit={(event) => void flow.submitActivation(event, flow.scanValue, "scan")}
            >
              <div className="terminal-activation__entry-header">
                <div>
                  <span className="terminal-activation__entry-tag">优先推荐</span>
                  <h2>扫码激活</h2>
                </div>
                <span className="terminal-activation__entry-badge">新装交付</span>
              </div>
              <p className="terminal-activation__entry-copy">
                扫描交付单上的二维码或激活链接，终端会自动识别并完成登录。
              </p>
              <textarea
                ref={flow.scanInputRef}
                aria-label="扫码激活内容"
                autoComplete="off"
                className="terminal-activation__input"
                onChange={(event) => {
                  flow.setScanValue(event.target.value);
                  if (flow.localError) {
                    flow.setLocalError(null);
                  }
                }}
                placeholder="扫描后的激活链接会自动填到这里，也可以直接粘贴完整链接"
                rows={4}
                spellCheck={false}
                value={flow.scanValue}
              />
              <div className="terminal-activation__entry-actions">
                <span className="terminal-activation__entry-hint">
                  支持扫码枪、扫码盒或直接粘贴链接
                </span>
                <button className="button button--primary" disabled={loading || !flow.scanValue.trim()} type="submit">
                  {loading ? "正在激活..." : "开始激活"}
                </button>
              </div>
            </form>

            <form
              className="terminal-activation__entry"
              onSubmit={(event) => void flow.submitActivation(event, flow.codeValue, "code")}
            >
              <div className="terminal-activation__entry-header">
                <div>
                  <span className="terminal-activation__entry-tag">恢复入口</span>
                  <h2>输入激活码</h2>
                </div>
                <span className="terminal-activation__entry-badge">换机 / 重装</span>
              </div>
              <p className="terminal-activation__entry-copy">
                当终端无法扫码时，输入激活码或粘贴完整激活链接，适合换机、重装和现场恢复。
              </p>
              <p className="terminal-activation__legacy-note">Manual recovery</p>
              <textarea
                aria-label="Bootstrap token"
                autoComplete="off"
                className="terminal-activation__input"
                id="bootstrap-token"
                onChange={(event) => {
                  flow.setCodeValue(event.target.value);
                  if (flow.localError) {
                    flow.setLocalError(null);
                  }
                }}
                placeholder="请输入激活码，或粘贴完整激活链接"
                rows={4}
                spellCheck={false}
                value={flow.codeValue}
              />
              <div className="terminal-activation__entry-actions">
                <span className="terminal-activation__entry-hint">
                  也支持现场直接粘贴系统签发的终端激活凭证
                </span>
                <button aria-label="激活终端" className="button button--primary" disabled={loading || !flow.codeValue.trim()} type="submit">
                  {loading ? "正在激活..." : "验证并进入"}
                </button>
              </div>
            </form>

            <section
              className="terminal-activation__entry terminal-activation__entry--pairing"
              aria-labelledby="pairing-title"
            >
              <div className="terminal-activation__entry-header">
                <div>
                  <span className="terminal-activation__entry-tag">现场认领</span>
                  <h2 id="pairing-title">等待绑定码认领</h2>
                </div>
                <span className={`terminal-activation__entry-badge is-${statusTone(flow.pairingStatus)}`}>
                  {pairingSummary.hint}
                </span>
              </div>
              <p className="terminal-activation__entry-copy">
                适合新装终端。管理端在“设置 &gt; 终端交付”输入这串绑定码后，当前终端会自动完成激活。
              </p>
              <p className="terminal-activation__legacy-note">Claim this code from Pairing claim.</p>

              <div className="terminal-activation__pairing-grid">
                <div className="terminal-activation__pairing-code">
                  <span className="terminal-activation__pairing-label">绑定码</span>
                  <strong data-testid="pairing-code-value">{pairingCode}</strong>
                </div>
                <div className={`terminal-activation__pairing-meta is-${statusTone(flow.pairingStatus)}`}>
                  <span>当前状态</span>
                  <strong data-testid="pairing-status-value">{pairingSummary.label}</strong>
                  <small>{pairingSummary.detail}</small>
                </div>
                <div className="terminal-activation__pairing-meta">
                  <span>剩余有效期</span>
                  <strong>{formatRemainingDuration(flow.expiresInSeconds)}</strong>
                  <small>{formatDateTime(flow.pairingSession?.expires_at)}</small>
                </div>
                <div className="terminal-activation__pairing-meta">
                  <span>刷新节流</span>
                  <strong>
                    {flow.refreshCooldownSeconds > 0
                      ? `${flow.refreshCooldownSeconds} 秒后可刷新`
                      : "现在可刷新"}
                  </strong>
                  <small>避免现场误刷导致绑定码频繁变化</small>
                </div>
              </div>

              <div className="terminal-activation__status-rail" aria-label="绑定状态轨迹">
                {pairingStages.map((stage) => (
                  <span className={`terminal-activation__status-chip is-${stage.state}`} key={stage.label}>
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
                  <dd>{formatDateTime(flow.pairingClaimedAt)}</dd>
                </div>
                <div>
                  <dt>凭证有效期</dt>
                  <dd>{formatDateTime(flow.pairingTokenExpiresAt)}</dd>
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
                  disabled={flow.pairingBusy || flow.refreshCooldownSeconds > 0}
                  onClick={() => void flow.refreshPairingSession()}
                  type="button"
                >
                  {flow.pairingBusy
                    ? "正在刷新..."
                    : flow.refreshCooldownSeconds > 0
                      ? `${flow.refreshCooldownSeconds} 秒后可刷新`
                      : "刷新绑定码"}
                </button>
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
