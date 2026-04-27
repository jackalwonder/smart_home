import {
  type TerminalActivationEntryMode,
  type TerminalActivationSuccessState,
} from "./terminalActivationModel";
import { useTerminalActivationFlow } from "./useTerminalActivationFlow";
import { ActivationSuccessPanel } from "../components/terminal/ActivationSuccessPanel";
import { ScanActivationForm } from "../components/terminal/ScanActivationForm";
import { CodeActivationForm } from "../components/terminal/CodeActivationForm";
import { PairingSection } from "../components/terminal/PairingSection";

export type { TerminalActivationEntryMode, TerminalActivationSuccessState };

interface TerminalActivationPageProps {
  terminalId: string;
  error: string | null;
  loading: boolean;
  onActivate: (bootstrapToken: string, mode: TerminalActivationEntryMode) => Promise<void>;
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

  return (
    <main className="terminal-activation">
      <section
        className="terminal-activation__panel"
        aria-labelledby="terminal-activation-title"
      >
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
          <p className="terminal-activation__legacy-note">
            Activate this terminal with a pairing code
          </p>
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

        {successState ? (
          <ActivationSuccessPanel
            successState={successState}
            onContinueAfterSuccess={onContinueAfterSuccess}
          />
        ) : (
          <div className="terminal-activation__entries">
            <ScanActivationForm
              disabled={loading}
              scanInputRef={flow.scanInputRef}
              scanValue={flow.scanValue}
              onActivate={(value) => void flow.submitActivation(null, value, "scan")}
              onChangeValue={(value) => {
                flow.setScanValue(value);
                if (flow.localError) {
                  flow.setLocalError(null);
                }
              }}
            />

            <CodeActivationForm
              disabled={loading}
              codeValue={flow.codeValue}
              onActivate={(value) => void flow.submitActivation(null, value, "code")}
              onChangeValue={(value) => {
                flow.setCodeValue(value);
                if (flow.localError) {
                  flow.setLocalError(null);
                }
              }}
            />

            <PairingSection
              expiresInSeconds={flow.expiresInSeconds}
              pairingBusy={flow.pairingBusy}
              pairingClaimedAt={flow.pairingClaimedAt}
              pairingError={flow.pairingError}
              pairingSession={flow.pairingSession}
              pairingStatus={flow.pairingStatus}
              pairingTokenExpiresAt={flow.pairingTokenExpiresAt}
              refreshCooldownSeconds={flow.refreshCooldownSeconds}
              terminalId={terminalId}
              onRefreshPairing={flow.refreshPairingSession}
            />
          </div>
        )}
      </section>
    </main>
  );
}
