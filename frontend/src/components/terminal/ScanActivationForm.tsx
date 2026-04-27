import type { RefObject } from "react";

interface ScanActivationFormProps {
  disabled: boolean;
  scanInputRef: RefObject<HTMLTextAreaElement | null>;
  scanValue: string;
  onActivate: (value: string) => void;
  onChangeValue: (value: string) => void;
}

export function ScanActivationForm({
  disabled,
  scanInputRef,
  scanValue,
  onActivate,
  onChangeValue,
}: ScanActivationFormProps) {
  return (
    <form
      className="terminal-activation__entry"
      onSubmit={(event) => {
        event.preventDefault();
        onActivate(scanValue);
      }}
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
        ref={scanInputRef}
        aria-label="扫码激活内容"
        autoComplete="off"
        className="terminal-activation__input"
        onChange={(event) => {
          onChangeValue(event.target.value);
        }}
        placeholder="扫描后的激活链接会自动填到这里，也可以直接粘贴完整链接"
        rows={4}
        spellCheck={false}
        value={scanValue}
      />
      <div className="terminal-activation__entry-actions">
        <span className="terminal-activation__entry-hint">
          支持扫码枪、扫码盒或直接粘贴链接
        </span>
        <button
          className="button button--primary"
          disabled={disabled || !scanValue.trim()}
          type="submit"
        >
          {disabled ? "正在激活..." : "开始激活"}
        </button>
      </div>
    </form>
  );
}
