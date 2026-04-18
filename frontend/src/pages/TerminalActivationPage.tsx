import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { normalizeApiError } from "../api/httpClient";
import {
  issueTerminalPairingCode,
  pollTerminalPairingCode,
} from "../api/terminalPairingCodesApi";
import {
  TerminalPairingIssueDto,
  TerminalPairingPollDto,
} from "../api/types";
import { BootstrapTokenActivationError } from "../api/authApi";
import { resolveBootstrapActivationInput } from "../auth/bootstrapToken";

interface TerminalActivationPageProps {
  terminalId: string;
  error: string | null;
  loading: boolean;
  onActivate: (bootstrapToken: string) => Promise<void>;
}

const PAIRING_POLL_INTERVAL_MS = 3000;

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

function pairingStatusCopy(status: string) {
  switch (status) {
    case "CLAIMED":
      return "Claimed. Waiting for secure handoff.";
    case "DELIVERED":
      return "Token delivered. Completing sign-in.";
    case "COMPLETED":
      return "Activation already completed.";
    case "EXPIRED":
      return "Pairing code expired. Refresh to issue a new one.";
    case "INVALIDATED":
      return "Pairing code was replaced. Refresh to issue a new one.";
    default:
      return "Waiting for claim.";
  }
}

function pairingStatusTone(status: string) {
  switch (status) {
    case "CLAIMED":
    case "DELIVERED":
    case "COMPLETED":
      return "success";
    case "EXPIRED":
    case "INVALIDATED":
      return "warning";
    default:
      return "waiting";
  }
}

function pairingIssueErrorCopy(error: unknown) {
  const payload = normalizeApiError(error);
  const retryAfter = payload.details?.retry_after_seconds;
  if (payload.details?.reason === "cooldown") {
    if (typeof retryAfter === "number" && retryAfter > 0) {
      return `A pairing code was just issued. Try refreshing again in ${retryAfter}s.`;
    }
    return "A pairing code was just issued. Try refreshing again shortly.";
  }
  return payload.message;
}

export function TerminalActivationPage({
  terminalId,
  error,
  loading,
  onActivate,
}: TerminalActivationPageProps) {
  const [token, setToken] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [pairingSession, setPairingSession] = useState<TerminalPairingIssueDto | null>(null);
  const [pairingStatus, setPairingStatus] = useState<TerminalPairingPollDto["status"]>("PENDING");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const refreshPairingSession = useCallback(async () => {
    if (!terminalId.trim()) {
      setPairingSession(null);
      setPairingError("Terminal ID is not configured for this build.");
      return;
    }
    setPairingBusy(true);
    try {
      const next = await issueTerminalPairingCode(terminalId);
      setPairingSession(next);
      setPairingStatus(next.status);
      setPairingError(null);
    } catch (refreshError) {
      setPairingError(pairingIssueErrorCopy(refreshError));
    } finally {
      setPairingBusy(false);
    }
  }, [terminalId]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    void refreshPairingSession();
  }, [refreshPairingSession]);

  useEffect(() => {
    if (!pairingSession?.pairing_id) {
      return;
    }
    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      try {
        const status = await pollTerminalPairingCode(
          pairingSession.terminal_id,
          pairingSession.pairing_id,
        );
        if (cancelled) {
          return;
        }
        setPairingStatus(status.status);
        if (status.bootstrap_token) {
          setPairingError(null);
          await onActivate(status.bootstrap_token);
          return;
        }
        if (status.status === "EXPIRED" || status.status === "INVALIDATED") {
          setPairingError(pairingStatusCopy(status.status));
          return;
        }
      } catch (pollError) {
        if (cancelled) {
          return;
        }
        setPairingError(normalizeApiError(pollError).message);
      }
      timer = window.setTimeout(tick, PAIRING_POLL_INTERVAL_MS);
    };

    timer = window.setTimeout(tick, PAIRING_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [onActivate, pairingSession?.pairing_id, pairingSession?.terminal_id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = token.trim();
    if (!normalized || loading) {
      return;
    }
    const resolvedToken = resolveBootstrapActivationInput(normalized);
    if (!resolvedToken) {
      setLocalError("We could not recognize a bootstrap token, activation link, or activation code.");
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

  const displayError = localError ?? pairingError ?? error;
  const pairingCode = pairingSession?.pairing_code ?? (pairingBusy ? "Loading..." : "-");
  const pairingTone = pairingError ? "warning" : pairingStatusTone(pairingStatus);

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
          <h1
            id="terminal-activation-title"
            aria-label="激活这台中控"
          >
            Activate this terminal with a pairing code
          </h1>
          <p>
            Ask a PIN-verified operator to claim the code below. This terminal will finish setup
            automatically after the secure handoff.
          </p>
        </div>

        <section className="terminal-activation__pairing" aria-labelledby="pairing-title">
          <div className="terminal-activation__pairing-header">
            <div>
              <h2 id="pairing-title">Pairing code</h2>
              <p className="muted-copy">
                Short-lived, one-time use, and safe to replace after the refresh cooldown.
              </p>
            </div>
            <button
              className="button button--ghost"
              disabled={pairingBusy}
              onClick={() => void refreshPairingSession()}
              type="button"
            >
              {pairingBusy ? "Refreshing..." : "Refresh code"}
            </button>
          </div>

          <div className="terminal-activation__pairing-grid">
            <div className="terminal-activation__pairing-code">
              <span className="terminal-activation__pairing-label">Code</span>
              <strong data-testid="pairing-code-value">
                {pairingCode}
              </strong>
            </div>
            <div className={`terminal-activation__pairing-meta is-${pairingTone}`}>
              <span>Status</span>
              <strong data-testid="pairing-status-value">{pairingStatusCopy(pairingStatus)}</strong>
            </div>
            <div className="terminal-activation__pairing-meta">
              <span>Expires</span>
              <strong>{formatDateTime(pairingSession?.expires_at)}</strong>
            </div>
          </div>
          <ol className="terminal-activation__steps" aria-label="Pairing steps">
            <li>Open Settings, then System.</li>
            <li>Verify management PIN.</li>
            <li>Claim this code from Pairing claim.</li>
          </ol>
          <p className="terminal-activation__terminal-id">
            Terminal ID <span data-testid="pairing-terminal-id">{terminalId}</span>
          </p>
        </section>

        <form className="terminal-activation__form" onSubmit={handleSubmit}>
          <div className="terminal-activation__manual-header">
            <div>
              <label htmlFor="bootstrap-token">Manual recovery</label>
              <p className="terminal-activation__hint">
                Paste a bootstrap token, activation link, or activation code when pairing is not
                available.
              </p>
            </div>
            <span>Fallback</span>
          </div>
          <textarea
            ref={inputRef}
            id="bootstrap-token"
            name="bootstrap-token"
            aria-label="Bootstrap token / activation link / activation code"
            autoComplete="off"
            spellCheck={false}
            value={token}
            onChange={(event) => {
              setToken(event.target.value);
              if (localError) {
                setLocalError(null);
              }
            }}
            placeholder="Paste bootstrap token, activation link, or activation code"
            rows={5}
          />
          {displayError ? (
            <p className="terminal-activation__error" role="alert">
              {displayError}
            </p>
          ) : (
            <p className="terminal-activation__hint">
              Keep this page open while the management workspace claims the pairing code.
            </p>
          )}
          <button
            aria-label="激活终端"
            className="button button--primary"
            type="submit"
            disabled={loading || !token.trim()}
          >
            {loading ? "Activating..." : "Activate terminal"}
          </button>
        </form>
      </section>
    </main>
  );
}
