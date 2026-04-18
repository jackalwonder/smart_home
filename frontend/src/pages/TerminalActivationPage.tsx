import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeApiError } from "../api/httpClient";
import { issueTerminalPairingCode, pollTerminalPairingCode } from "../api/terminalPairingCodesApi";
import { TerminalPairingIssueDto, TerminalPairingPollDto } from "../api/types";
import { resolveBootstrapActivationInput } from "../auth/bootstrapToken";

export type TerminalActivationEntryMode = "scan" | "code" | "pairing";

export interface TerminalActivationSuccessState {
  destinationLabel: string;
  mode: TerminalActivationEntryMode;
}

interface TerminalActivationPageProps {
  terminalId: string;
  error: string | null;
  loading: boolean;
  onActivate: (bootstrapToken: string, mode: TerminalActivationEntryMode) => Promise<void>;
  onContinueAfterSuccess: () => void;
  successState: TerminalActivationSuccessState | null;
}

const PAIRING_POLL_INTERVAL_MS = 3000;
const PAIRING_REFRESH_COOLDOWN_SECONDS = 30;

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

function formatRemainingDuration(totalSeconds: number | null) {
  if (totalSeconds === null) {
    return "-";
  }
  if (totalSeconds <= 0) {
    return "\u5df2\u5230\u671f";
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}\u5c0f\u65f6 ${remainingMinutes}\u5206`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function secondsUntil(value: string | null | undefined, nowMs: number) {
  if (!value) {
    return null;
  }
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return null;
  }
  return Math.max(0, Math.ceil((timestamp - nowMs) / 1000));
}

function statusTone(status: TerminalPairingPollDto["status"]) {
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

function pairingStatusSummary(status: TerminalPairingPollDto["status"]) {
  switch (status) {
    case "CLAIMED":
      return {
        detail:
          "\u7ba1\u7406\u7aef\u5df2\u8ba4\u9886\uff0c\u6b63\u5728\u628a\u6fc0\u6d3b\u51ed\u8bc1\u5b89\u5168\u4e0b\u53d1\u5230\u8fd9\u53f0\u7ec8\u7aef\u3002",
        hint: "\u5df2\u8ba4\u9886",
        label: "\u5df2\u8ba4\u9886",
      };
    case "DELIVERED":
      return {
        detail:
          "\u6fc0\u6d3b\u51ed\u8bc1\u5df2\u9001\u8fbe\uff0c\u7ec8\u7aef\u6b63\u5728\u5b8c\u6210\u767b\u5f55\u3002",
        hint: "\u5df2\u6fc0\u6d3b",
        label: "\u5df2\u6fc0\u6d3b",
      };
    case "COMPLETED":
      return {
        detail:
          "\u8fd9\u53f0\u7ec8\u7aef\u5df2\u7ecf\u5b8c\u6210\u6fc0\u6d3b\u3002\u5982\u679c\u9875\u9762\u6ca1\u6709\u81ea\u52a8\u8fdb\u5165\u9996\u9875\uff0c\u8bf7\u91cd\u65b0\u751f\u6210\u7ed1\u5b9a\u7801\u3002",
        hint: "\u5df2\u6fc0\u6d3b",
        label: "\u5df2\u6fc0\u6d3b",
      };
    case "EXPIRED":
      return {
        detail:
          "\u8fd9\u6b21\u7ed1\u5b9a\u7801\u5df2\u7ecf\u8fc7\u671f\uff0c\u8bf7\u5237\u65b0\u751f\u6210\u65b0\u7684\u7ed1\u5b9a\u7801\u3002",
        hint: "\u5df2\u8fc7\u671f",
        label: "\u5df2\u8fc7\u671f",
      };
    case "INVALIDATED":
      return {
        detail:
          "\u65e7\u7ed1\u5b9a\u7801\u5df2\u88ab\u65b0\u7684\u7ed1\u5b9a\u7801\u66ff\u6362\uff0c\u8bf7\u4ee5\u6700\u65b0\u7ed1\u5b9a\u7801\u4e3a\u51c6\u3002",
        hint: "\u5df2\u8fc7\u671f",
        label: "\u5df2\u8fc7\u671f",
      };
    default:
      return {
        detail:
          "\u7ed1\u5b9a\u7801\u5df2\u7ecf\u53d1\u51fa\uff0c\u6b63\u5728\u7b49\u5f85\u7ba1\u7406\u7aef\u8ba4\u9886\u3002",
        hint: "\u5f85\u8ba4\u9886",
        label: "\u5df2\u53d1\u7801",
      };
  }
}

function pairingIssueErrorCopy(error: unknown) {
  const payload = normalizeApiError(error);
  const retryAfter = payload.details?.retry_after_seconds;
  if (payload.details?.reason === "cooldown") {
    if (typeof retryAfter === "number" && retryAfter > 0) {
      return `\u7ed1\u5b9a\u7801\u521a\u521a\u5237\u65b0\u8fc7\uff0c\u8bf7\u5728 ${retryAfter} \u79d2\u540e\u518d\u8bd5\u3002`;
    }
    return "\u7ed1\u5b9a\u7801\u521a\u521a\u5237\u65b0\u8fc7\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002";
  }
  if (payload.code === "NOT_FOUND") {
    return "\u8fd9\u53f0\u7ec8\u7aef\u8fd8\u6ca1\u6709\u767b\u8bb0\u5230\u4ea4\u4ed8\u6e05\u5355\uff0c\u6682\u65f6\u65e0\u6cd5\u751f\u6210\u7ed1\u5b9a\u7801\u3002";
  }
  return payload.message;
}

function pairingPollErrorCopy(error: unknown) {
  const payload = normalizeApiError(error);
  if (payload.code === "NOT_FOUND") {
    return "\u8fd9\u6b21\u7ed1\u5b9a\u6d41\u7a0b\u5df2\u7ecf\u5931\u6548\uff0c\u8bf7\u5237\u65b0\u751f\u6210\u65b0\u7684\u7ed1\u5b9a\u7801\u3002";
  }
  return payload.message;
}

function activationInputError(mode: TerminalActivationEntryMode) {
  if (mode === "scan") {
    return "\u6ca1\u6709\u8bc6\u522b\u5230\u53ef\u7528\u7684\u6fc0\u6d3b\u94fe\u63a5\uff0c\u8bf7\u91cd\u65b0\u626b\u7801\u6216\u7c98\u8d34\u5b8c\u6574\u94fe\u63a5\u3002";
  }
  return "\u6ca1\u6709\u8bc6\u522b\u5230\u53ef\u7528\u7684\u6fc0\u6d3b\u7801\uff0c\u8bf7\u68c0\u67e5\u5185\u5bb9\u662f\u5426\u5b8c\u6574\u3002";
}

function entryTitle(mode: TerminalActivationEntryMode) {
  switch (mode) {
    case "scan":
      return "\u626b\u7801\u6fc0\u6d3b";
    case "code":
      return "\u8f93\u5165\u6fc0\u6d3b\u7801";
    default:
      return "\u7b49\u5f85\u7ed1\u5b9a\u7801\u8ba4\u9886";
  }
}

function completionCopy(mode: TerminalActivationEntryMode) {
  switch (mode) {
    case "scan":
      return {
        detail:
          "\u4e8c\u7ef4\u7801\u5185\u5bb9\u5df2\u9a8c\u8bc1\u901a\u8fc7\uff0c\u7ec8\u7aef\u4f1a\u76f4\u63a5\u8fdb\u5165\u9996\u9875\u3002",
        title: "\u626b\u7801\u6fc0\u6d3b\u5b8c\u6210",
      };
    case "code":
      return {
        detail:
          "\u6062\u590d\u51ed\u8bc1\u5df2\u9a8c\u8bc1\u901a\u8fc7\uff0c\u7ec8\u7aef\u4f1a\u76f4\u63a5\u8fdb\u5165\u9996\u9875\u3002",
        title: "\u6062\u590d\u6fc0\u6d3b\u5b8c\u6210",
      };
    default:
      return {
        detail:
          "\u7ba1\u7406\u7aef\u8ba4\u9886\u5df2\u7ecf\u5b8c\u6210\uff0c\u7ec8\u7aef\u4f1a\u76f4\u63a5\u8fdb\u5165\u9996\u9875\u3002",
        title: "\u65b0\u88c5\u7ec8\u7aef\u5df2\u6fc0\u6d3b",
      };
  }
}

type StatusStageState = "done" | "current" | "upcoming" | "warning";

function buildPairingStages(status: TerminalPairingPollDto["status"]) {
  const states: Record<string, StatusStageState> = {
    claimed: "upcoming",
    delivered: "upcoming",
    expired: "upcoming",
    issued: "current",
    pending: "upcoming",
  };

  switch (status) {
    case "CLAIMED":
      states.issued = "done";
      states.pending = "done";
      states.claimed = "current";
      break;
    case "DELIVERED":
    case "COMPLETED":
      states.issued = "done";
      states.pending = "done";
      states.claimed = "done";
      states.delivered = "current";
      break;
    case "EXPIRED":
    case "INVALIDATED":
      states.issued = "done";
      states.pending = "done";
      states.expired = "warning";
      break;
    default:
      states.pending = "current";
      break;
  }

  return [
    { label: "\u5df2\u53d1\u7801", state: states.issued },
    { label: "\u5f85\u8ba4\u9886", state: states.pending },
    { label: "\u5df2\u8ba4\u9886", state: states.claimed },
    { label: "\u5df2\u6fc0\u6d3b", state: states.delivered },
    { label: "\u5df2\u8fc7\u671f", state: states.expired },
  ];
}

export function TerminalActivationPage({
  terminalId,
  error,
  loading,
  onActivate,
  onContinueAfterSuccess,
  successState,
}: TerminalActivationPageProps) {
  const [scanValue, setScanValue] = useState("");
  const [codeValue, setCodeValue] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [pairingSession, setPairingSession] = useState<TerminalPairingIssueDto | null>(null);
  const [pairingStatus, setPairingStatus] = useState<TerminalPairingPollDto["status"]>("PENDING");
  const [pairingClaimedAt, setPairingClaimedAt] = useState<string | null>(null);
  const [pairingTokenExpiresAt, setPairingTokenExpiresAt] = useState<string | null>(null);
  const [refreshCooldownUntil, setRefreshCooldownUntil] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const scanInputRef = useRef<HTMLTextAreaElement | null>(null);

  const refreshCooldownSeconds = useMemo(() => {
    if (!refreshCooldownUntil) {
      return 0;
    }
    return Math.max(0, Math.ceil((refreshCooldownUntil - nowMs) / 1000));
  }, [nowMs, refreshCooldownUntil]);

  const expiresInSeconds = useMemo(
    () => secondsUntil(pairingSession?.expires_at, nowMs),
    [nowMs, pairingSession?.expires_at],
  );

  const pairingSummary = pairingStatusSummary(pairingStatus);
  const pairingStages = buildPairingStages(pairingStatus);
  const displayError = localError ?? pairingError ?? error;
  const pairingCode = pairingSession?.pairing_code ?? (pairingBusy ? "Loading..." : "--");
  const successCopy = successState ? completionCopy(successState.mode) : null;

  const refreshPairingSession = useCallback(async () => {
    if (!terminalId.trim()) {
      setPairingSession(null);
      setPairingError(
        "\u5f53\u524d\u6784\u5efa\u6ca1\u6709\u5199\u5165\u7ec8\u7aef\u6807\u8bc6\uff0c\u65e0\u6cd5\u751f\u6210\u7ed1\u5b9a\u7801\u3002",
      );
      return;
    }
    setPairingBusy(true);
    try {
      const next = await issueTerminalPairingCode(terminalId);
      setPairingSession(next);
      setPairingStatus(next.status);
      setPairingClaimedAt(null);
      setPairingTokenExpiresAt(null);
      setPairingError(null);
      setRefreshCooldownUntil(Date.now() + PAIRING_REFRESH_COOLDOWN_SECONDS * 1000);
    } catch (refreshError) {
      const payload = normalizeApiError(refreshError);
      const retryAfter =
        typeof payload.details?.retry_after_seconds === "number"
          ? payload.details.retry_after_seconds
          : null;
      if (retryAfter && retryAfter > 0) {
        setRefreshCooldownUntil(Date.now() + retryAfter * 1000);
      }
      setPairingError(pairingIssueErrorCopy(refreshError));
    } finally {
      setPairingBusy(false);
    }
  }, [terminalId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (successState) {
      return;
    }
    scanInputRef.current?.focus();
  }, [successState]);

  useEffect(() => {
    if (successState) {
      return;
    }
    void refreshPairingSession();
  }, [refreshPairingSession, successState]);

  useEffect(() => {
    if (successState || !pairingSession?.pairing_id) {
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
        setPairingClaimedAt(status.claimed_at);
        setPairingTokenExpiresAt(status.bootstrap_token_expires_at);
        if (status.bootstrap_token) {
          setPairingError(null);
          await onActivate(status.bootstrap_token, "pairing");
          return;
        }
        if (
          status.status === "EXPIRED" ||
          status.status === "INVALIDATED" ||
          status.status === "COMPLETED"
        ) {
          setPairingError(pairingStatusSummary(status.status).detail);
          return;
        }
      } catch (pollError) {
        if (cancelled) {
          return;
        }
        setPairingError(pairingPollErrorCopy(pollError));
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
  }, [onActivate, pairingSession?.pairing_id, pairingSession?.terminal_id, successState]);

  async function submitActivation(
    event: FormEvent<HTMLFormElement>,
    rawValue: string,
    mode: TerminalActivationEntryMode,
  ) {
    event.preventDefault();
    if (!rawValue.trim() || loading) {
      return;
    }
    const resolvedToken = resolveBootstrapActivationInput(rawValue.trim());
    if (!resolvedToken) {
      setLocalError(activationInputError(mode));
      return;
    }
    setLocalError(null);
    await onActivate(resolvedToken, mode);
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
          <div className="terminal-activation__visual-copy">
            <strong>
              {"\u6fc0\u6d3b\u5b8c\u6210\u540e\u81ea\u52a8\u8fdb\u5165\u9996\u9875"}
            </strong>
            <span>{"\u540e\u7eed\u7ba1\u7406\u5165\u53e3\u5728 \u8bbe\u7f6e > \u7ec8\u7aef\u4ea4\u4ed8"}</span>
          </div>
        </div>

        <div className="terminal-activation__copy">
          <span className="card-eyebrow">{"\u7ec8\u7aef\u4ea4\u4ed8"}</span>
          <h1 id="terminal-activation-title">{"\u6fc0\u6d3b\u8fd9\u53f0\u4e2d\u63a7"}</h1>
          <p>
            {
              "\u65b0\u88c5\u7ec8\u7aef\u4f18\u5148\u7528\u626b\u7801\u6216\u7ed1\u5b9a\u7801\u8ba4\u9886\uff0c\u6362\u673a\u3001\u91cd\u88c5\u548c\u6062\u590d\u53ef\u4ee5\u76f4\u63a5\u8f93\u5165\u6fc0\u6d3b\u7801\u3002\u7ec8\u7aef\u6fc0\u6d3b\u6210\u529f\u540e\u4f1a\u76f4\u63a5\u8fdb\u5165\u9996\u9875\u3002"
            }
          </p>
          <p className="terminal-activation__legacy-note">Activate this terminal with a pairing code</p>
          <dl className="terminal-activation__summary">
            <div>
              <dt>{"\u7ec8\u7aef ID"}</dt>
              <dd data-testid="pairing-terminal-id">{terminalId || "\u672a\u914d\u7f6e"}</dd>
            </div>
            <div>
              <dt>{"\u73b0\u573a\u5165\u53e3"}</dt>
              <dd>
                {
                  "\u626b\u7801\u6fc0\u6d3b / \u8f93\u5165\u6fc0\u6d3b\u7801 / \u7b49\u5f85\u7ed1\u5b9a\u7801\u8ba4\u9886"
                }
              </dd>
            </div>
            <div>
              <dt>{"\u8fdb\u5165\u4f4d\u7f6e"}</dt>
              <dd>{"\u9996\u9875"}</dd>
            </div>
          </dl>
          {displayError ? (
            <p className="terminal-activation__alert is-warning" role="alert">
              {displayError}
            </p>
          ) : (
            <p className="terminal-activation__alert">
              {
                "\u4fdd\u6301\u5f53\u524d\u9875\u9762\u6253\u5f00\uff0c\u73b0\u573a\u7ba1\u7406\u7aef\u5b8c\u6210\u8ba4\u9886\u540e\uff0c\u7ec8\u7aef\u4f1a\u81ea\u52a8\u7ee7\u7eed\u3002"
              }
            </p>
          )}
        </div>

        {successState && successCopy ? (
          <section
            className="terminal-activation__success"
            aria-labelledby="terminal-activation-success-title"
          >
            <span className="terminal-activation__success-pill">
              {"\u5df2\u5b8c\u6210\u6fc0\u6d3b"}
            </span>
            <h2 id="terminal-activation-success-title">{successCopy.title}</h2>
            <p>{successCopy.detail}</p>
            <dl className="terminal-activation__success-meta">
              <div>
                <dt>{"\u5b8c\u6210\u5165\u53e3"}</dt>
                <dd>{entryTitle(successState.mode)}</dd>
              </div>
              <div>
                <dt>{"\u5373\u5c06\u8fdb\u5165"}</dt>
                <dd>{successState.destinationLabel}</dd>
              </div>
              <div>
                <dt>{"\u540e\u7eed\u64cd\u4f5c"}</dt>
                <dd>{"\u8bbe\u7f6e > \u7ec8\u7aef\u4ea4\u4ed8"}</dd>
              </div>
            </dl>
            <button
              className="button button--primary"
              onClick={onContinueAfterSuccess}
              type="button"
            >
              {"\u8fdb\u5165\u9996\u9875"}
            </button>
          </section>
        ) : (
          <div className="terminal-activation__entries">
            <form
              className="terminal-activation__entry"
              onSubmit={(event) => void submitActivation(event, scanValue, "scan")}
            >
              <div className="terminal-activation__entry-header">
                <div>
                  <span className="terminal-activation__entry-tag">
                    {"\u4f18\u5148\u63a8\u8350"}
                  </span>
                  <h2>{"\u626b\u7801\u6fc0\u6d3b"}</h2>
                </div>
                <span className="terminal-activation__entry-badge">
                  {"\u65b0\u88c5\u4ea4\u4ed8"}
                </span>
              </div>
              <p className="terminal-activation__entry-copy">
                {
                  "\u626b\u63cf\u4ea4\u4ed8\u5355\u4e0a\u7684\u4e8c\u7ef4\u7801\u6216\u6fc0\u6d3b\u94fe\u63a5\uff0c\u7ec8\u7aef\u4f1a\u81ea\u52a8\u8bc6\u522b\u5e76\u5b8c\u6210\u767b\u5f55\u3002"
                }
              </p>
              <textarea
                ref={scanInputRef}
                aria-label={"扫码激活内容"}
                autoComplete="off"
                className="terminal-activation__input"
                onChange={(event) => {
                  setScanValue(event.target.value);
                  if (localError) {
                    setLocalError(null);
                  }
                }}
                placeholder={
                  "\u626b\u63cf\u540e\u7684\u6fc0\u6d3b\u94fe\u63a5\u4f1a\u81ea\u52a8\u586b\u5230\u8fd9\u91cc\uff0c\u4e5f\u53ef\u4ee5\u76f4\u63a5\u7c98\u8d34\u5b8c\u6574\u94fe\u63a5"
                }
                rows={4}
                spellCheck={false}
                value={scanValue}
              />
              <div className="terminal-activation__entry-actions">
                <span className="terminal-activation__entry-hint">
                  {
                    "\u652f\u6301\u626b\u7801\u67aa\u3001\u626b\u7801\u76d2\u6216\u76f4\u63a5\u7c98\u8d34\u94fe\u63a5"
                  }
                </span>
                <button
                  className="button button--primary"
                  disabled={loading || !scanValue.trim()}
                  type="submit"
                >
                  {loading ? "\u6b63\u5728\u6fc0\u6d3b..." : "\u5f00\u59cb\u6fc0\u6d3b"}
                </button>
              </div>
            </form>

            <form
              className="terminal-activation__entry"
              onSubmit={(event) => void submitActivation(event, codeValue, "code")}
            >
              <div className="terminal-activation__entry-header">
                <div>
                  <span className="terminal-activation__entry-tag">
                    {"\u6062\u590d\u5165\u53e3"}
                  </span>
                  <h2>{"\u8f93\u5165\u6fc0\u6d3b\u7801"}</h2>
                </div>
                <span className="terminal-activation__entry-badge">
                  {"\u6362\u673a / \u91cd\u88c5"}
                </span>
              </div>
              <p className="terminal-activation__entry-copy">
                {
                  "\u5f53\u7ec8\u7aef\u65e0\u6cd5\u626b\u7801\u65f6\uff0c\u8f93\u5165\u6fc0\u6d3b\u7801\u6216\u7c98\u8d34\u5b8c\u6574\u6fc0\u6d3b\u94fe\u63a5\uff0c\u9002\u5408\u6362\u673a\u3001\u91cd\u88c5\u548c\u73b0\u573a\u6062\u590d\u3002"
                }
              </p>
              <p className="terminal-activation__legacy-note">Manual recovery</p>
              <textarea
                aria-label="Bootstrap token"
                autoComplete="off"
                className="terminal-activation__input"
                id="bootstrap-token"
                onChange={(event) => {
                  setCodeValue(event.target.value);
                  if (localError) {
                    setLocalError(null);
                  }
                }}
                placeholder={
                  "\u8bf7\u8f93\u5165\u6fc0\u6d3b\u7801\uff0c\u6216\u7c98\u8d34\u5b8c\u6574\u6fc0\u6d3b\u94fe\u63a5"
                }
                rows={4}
                spellCheck={false}
                value={codeValue}
              />
              <div className="terminal-activation__entry-actions">
                <span className="terminal-activation__entry-hint">
                  {
                    "\u4e5f\u652f\u6301\u73b0\u573a\u76f4\u63a5\u7c98\u8d34\u7cfb\u7edf\u7b7e\u53d1\u7684\u7ec8\u7aef\u6fc0\u6d3b\u51ed\u8bc1"
                  }
                </span>
                <button
                  aria-label={"激活终端"}
                  className="button button--primary"
                  disabled={loading || !codeValue.trim()}
                  type="submit"
                >
                  {loading ? "\u6b63\u5728\u6fc0\u6d3b..." : "\u9a8c\u8bc1\u5e76\u8fdb\u5165"}
                </button>
              </div>
            </form>

            <section
              className="terminal-activation__entry terminal-activation__entry--pairing"
              aria-labelledby="pairing-title"
            >
              <div className="terminal-activation__entry-header">
                <div>
                  <span className="terminal-activation__entry-tag">
                    {"\u73b0\u573a\u8ba4\u9886"}
                  </span>
                  <h2 id="pairing-title">{"\u7b49\u5f85\u7ed1\u5b9a\u7801\u8ba4\u9886"}</h2>
                </div>
                <span className={`terminal-activation__entry-badge is-${statusTone(pairingStatus)}`}>
                  {pairingSummary.hint}
                </span>
              </div>
              <p className="terminal-activation__entry-copy">
                {
                  "\u9002\u5408\u65b0\u88c5\u7ec8\u7aef\u3002\u7ba1\u7406\u7aef\u5728\u201c\u8bbe\u7f6e > \u7ec8\u7aef\u4ea4\u4ed8\u201d\u8f93\u5165\u8fd9\u4e32\u7ed1\u5b9a\u7801\u540e\uff0c\u5f53\u524d\u7ec8\u7aef\u4f1a\u81ea\u52a8\u5b8c\u6210\u6fc0\u6d3b\u3002"
                }
              </p>
              <p className="terminal-activation__legacy-note">Claim this code from Pairing claim.</p>

              <div className="terminal-activation__pairing-grid">
                <div className="terminal-activation__pairing-code">
                  <span className="terminal-activation__pairing-label">
                    {"\u7ed1\u5b9a\u7801"}
                  </span>
                  <strong data-testid="pairing-code-value">{pairingCode}</strong>
                </div>
                <div className={`terminal-activation__pairing-meta is-${statusTone(pairingStatus)}`}>
                  <span>{"\u5f53\u524d\u72b6\u6001"}</span>
                  <strong data-testid="pairing-status-value">{pairingSummary.label}</strong>
                  <small>{pairingSummary.detail}</small>
                </div>
                <div className="terminal-activation__pairing-meta">
                  <span>{"\u5269\u4f59\u6709\u6548\u671f"}</span>
                  <strong>{formatRemainingDuration(expiresInSeconds)}</strong>
                  <small>{formatDateTime(pairingSession?.expires_at)}</small>
                </div>
                <div className="terminal-activation__pairing-meta">
                  <span>{"\u5237\u65b0\u8282\u6d41"}</span>
                  <strong>
                    {refreshCooldownSeconds > 0
                      ? `${refreshCooldownSeconds} \u79d2\u540e\u53ef\u5237\u65b0`
                      : "\u73b0\u5728\u53ef\u5237\u65b0"}
                  </strong>
                  <small>
                    {"\u907f\u514d\u73b0\u573a\u8bef\u5237\u5bfc\u81f4\u7ed1\u5b9a\u7801\u9891\u7e41\u53d8\u5316"}
                  </small>
                </div>
              </div>

              <div className="terminal-activation__status-rail" aria-label={"绑定状态轨迹"}>
                {pairingStages.map((stage) => (
                  <span
                    className={`terminal-activation__status-chip is-${stage.state}`}
                    key={stage.label}
                  >
                    {stage.label}
                  </span>
                ))}
              </div>

              <ol className="terminal-activation__steps" aria-label={"现场认领步骤"}>
                <li className="terminal-activation__legacy-step">Verify management PIN.</li>
                <li>{"\u7ba1\u7406\u7aef\u8fdb\u5165 \u8bbe\u7f6e > \u7ec8\u7aef\u4ea4\u4ed8\u3002"}</li>
                <li>
                  {
                    "\u7ba1\u7406\u4eba\u5458\u8f93\u5165\u7ba1\u7406 PIN\uff0c\u786e\u8ba4\u6709\u6743\u9650\u64cd\u4f5c\u3002"
                  }
                </li>
                <li>
                  {
                    "\u5728\u7ed1\u5b9a\u7801\u8ba4\u9886\u91cc\u8f93\u5165\u5f53\u524d\u7ed1\u5b9a\u7801\uff0c\u7ec8\u7aef\u4f1a\u81ea\u52a8\u6fc0\u6d3b\u3002"
                  }
                </li>
              </ol>

              <dl className="terminal-activation__pairing-timeline">
                <div>
                  <dt>{"\u8ba4\u9886\u65f6\u95f4"}</dt>
                  <dd>{formatDateTime(pairingClaimedAt)}</dd>
                </div>
                <div>
                  <dt>{"\u51ed\u8bc1\u6709\u6548\u671f"}</dt>
                  <dd>{formatDateTime(pairingTokenExpiresAt)}</dd>
                </div>
                <div>
                  <dt>{"\u7ec8\u7aef\u6807\u8bc6"}</dt>
                  <dd>{terminalId || "\u672a\u914d\u7f6e"}</dd>
                </div>
              </dl>

              <div className="terminal-activation__entry-actions">
                <span className="terminal-activation__entry-hint">
                  {
                    "\u5982\u679c\u73b0\u573a\u5df2\u7ecf\u6362\u673a\u6216\u6062\u590d\uff0c\u4f18\u5148\u4f7f\u7528\u4e0a\u9762\u7684\u626b\u7801\u6fc0\u6d3b\u6216\u6fc0\u6d3b\u7801\u5165\u53e3\u3002"
                  }
                </span>
                <button
                  className="button button--ghost"
                  disabled={pairingBusy || refreshCooldownSeconds > 0}
                  onClick={() => void refreshPairingSession()}
                  type="button"
                >
                  {pairingBusy
                    ? "\u6b63\u5728\u5237\u65b0..."
                    : refreshCooldownSeconds > 0
                      ? `${refreshCooldownSeconds} \u79d2\u540e\u53ef\u5237\u65b0`
                      : "\u5237\u65b0\u7ed1\u5b9a\u7801"}
                </button>
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
