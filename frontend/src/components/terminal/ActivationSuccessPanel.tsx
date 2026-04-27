import {
  completionCopy,
  entryTitle,
  type TerminalActivationSuccessState,
} from "../../pages/terminalActivationModel";

interface ActivationSuccessPanelProps {
  successState: TerminalActivationSuccessState;
  onContinueAfterSuccess: () => void;
}

export function ActivationSuccessPanel({
  successState,
  onContinueAfterSuccess,
}: ActivationSuccessPanelProps) {
  const successCopy = completionCopy(successState.mode);

  if (!successCopy) {
    return null;
  }

  return (
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
      <button
        className="button button--primary"
        onClick={onContinueAfterSuccess}
        type="button"
      >
        进入首页
      </button>
    </section>
  );
}
