import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  issueTerminalPairingCode,
  pollTerminalPairingCode,
} from "../api/terminalPairingCodesApi";
import { normalizeApiError } from "../api/httpClient";
import { TerminalPairingIssueDto, TerminalPairingPollDto } from "../api/types";
import { resolveBootstrapActivationInput } from "../auth/bootstrapToken";
import {
  activationInputError,
  PAIRING_POLL_INTERVAL_MS,
  PAIRING_REFRESH_COOLDOWN_SECONDS,
  pairingIssueErrorCopy,
  pairingPollErrorCopy,
  pairingStatusSummary,
  secondsUntil,
  TerminalActivationEntryMode,
  TerminalActivationSuccessState,
} from "./terminalActivationModel";

interface UseTerminalActivationFlowOptions {
  loading: boolean;
  onActivate: (bootstrapToken: string, mode: TerminalActivationEntryMode) => Promise<void>;
  successState: TerminalActivationSuccessState | null;
  terminalId: string;
}

export function useTerminalActivationFlow({
  loading,
  onActivate,
  successState,
  terminalId,
}: UseTerminalActivationFlowOptions) {
  const [scanValue, setScanValue] = useState("");
  const [codeValue, setCodeValue] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [pairingSession, setPairingSession] = useState<TerminalPairingIssueDto | null>(null);
  const [pairingStatus, setPairingStatus] =
    useState<TerminalPairingPollDto["status"]>("PENDING");
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

  const refreshPairingSession = useCallback(async () => {
    if (!terminalId.trim()) {
      setPairingSession(null);
      setPairingError("当前构建没有写入终端标识，无法生成绑定码。");
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

  return {
    codeValue,
    expiresInSeconds,
    localError,
    pairingBusy,
    pairingClaimedAt,
    pairingError,
    pairingSession,
    pairingStatus,
    pairingTokenExpiresAt,
    refreshCooldownSeconds,
    refreshPairingSession,
    scanInputRef,
    scanValue,
    setCodeValue,
    setLocalError,
    setScanValue,
    submitActivation,
  };
}
