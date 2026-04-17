import { FormEvent, useEffect, useRef, useState } from "react";

interface TerminalActivationPageProps {
  error: string | null;
  loading: boolean;
  onActivate: (bootstrapToken: string) => Promise<void>;
}

export function TerminalActivationPage({ error, loading, onActivate }: TerminalActivationPageProps) {
  const [token, setToken] = useState("");
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
    await onActivate(normalized);
  }

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
          <p>输入管理端签发的 bootstrap token。激活成功后，这台终端会保存令牌并自动进入控制台。</p>
        </div>

        <form className="terminal-activation__form" onSubmit={handleSubmit}>
          <label htmlFor="bootstrap-token">Bootstrap token</label>
          <textarea
            ref={inputRef}
            id="bootstrap-token"
            name="bootstrap-token"
            autoComplete="off"
            spellCheck={false}
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="粘贴 bootstrap token"
            rows={5}
          />
          {error ? (
            <p className="terminal-activation__error" role="alert">
              {error}
            </p>
          ) : (
            <p className="terminal-activation__hint">可在管理端重新创建或重置终端 token。</p>
          )}
          <button className="button button--primary" type="submit" disabled={loading || !token.trim()}>
            {loading ? "正在激活" : "激活终端"}
          </button>
        </form>
      </section>
    </main>
  );
}
