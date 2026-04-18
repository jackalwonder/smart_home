import { FormEvent, useEffect, useRef, useState } from "react";
import { BootstrapTokenActivationError } from "../api/authApi";
import { resolveBootstrapActivationInput } from "../auth/bootstrapToken";

interface TerminalActivationPageProps {
  error: string | null;
  loading: boolean;
  onActivate: (bootstrapToken: string) => Promise<void>;
}

export function TerminalActivationPage({ error, loading, onActivate }: TerminalActivationPageProps) {
  const [token, setToken] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = token.trim();
    if (!normalized || loading) {
      return;
    }
    const resolvedToken = resolveBootstrapActivationInput(normalized);
    if (!resolvedToken) {
      setLocalError("未识别到可用的激活信息，请粘贴 bootstrap token、激活链接或激活码。");
      return;
    }
    setLocalError(null);
    try {
      await onActivate(resolvedToken);
    } catch (submitError) {
      if (submitError instanceof BootstrapTokenActivationError && submitError.reason === "malformed") {
        setLocalError(submitError.message);
      }
      throw submitError;
    }
  }

  const displayError = localError ?? error;

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
        </div>

        <div className="terminal-activation__copy">
          <span className="card-eyebrow">Terminal activation</span>
          <h1 id="terminal-activation-title">激活这台中控</h1>
          <p>输入管理端交付的 bootstrap token、激活链接或激活码。激活成功后，这台终端会保存令牌并自动进入控制台。</p>
        </div>

        <form className="terminal-activation__form" onSubmit={handleSubmit}>
          <label htmlFor="bootstrap-token">Bootstrap token / 激活链接 / 激活码</label>
          <textarea
            ref={inputRef}
            id="bootstrap-token"
            name="bootstrap-token"
            autoComplete="off"
            spellCheck={false}
            value={token}
            onChange={(event) => {
              setToken(event.target.value);
              if (localError) {
                setLocalError(null);
              }
            }}
            placeholder="粘贴 bootstrap token、激活链接或激活码"
            rows={5}
          />
          {displayError ? (
            <p className="terminal-activation__error" role="alert">
              {displayError}
            </p>
          ) : (
            <p className="terminal-activation__hint">
              可在管理端复制激活链接、扫码二维码，或复制激活码到当前终端。
            </p>
          )}
          <button className="button button--primary" type="submit" disabled={loading || !token.trim()}>
            {loading ? "正在激活" : "激活终端"}
          </button>
        </form>
      </section>
    </main>
  );
}
