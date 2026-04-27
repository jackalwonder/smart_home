interface CodeActivationFormProps {
  disabled: boolean;
  codeValue: string;
  onActivate: (value: string) => void;
  onChangeValue: (value: string) => void;
}

export function CodeActivationForm({
  disabled,
  codeValue,
  onActivate,
  onChangeValue,
}: CodeActivationFormProps) {
  return (
    <form
      className="terminal-activation__entry"
      onSubmit={(event) => {
        event.preventDefault();
        onActivate(codeValue);
      }}
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
          onChangeValue(event.target.value);
        }}
        placeholder="请输入激活码，或粘贴完整激活链接"
        rows={4}
        spellCheck={false}
        value={codeValue}
      />
      <div className="terminal-activation__entry-actions">
        <span className="terminal-activation__entry-hint">
          也支持现场直接粘贴系统签发的终端激活凭证
        </span>
        <button
          aria-label="激活终端"
          className="button button--primary"
          disabled={disabled || !codeValue.trim()}
          type="submit"
        >
          {disabled ? "正在激活..." : "验证并进入"}
        </button>
      </div>
    </form>
  );
}
