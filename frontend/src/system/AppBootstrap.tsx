import { PropsWithChildren, useCallback, useEffect, useState } from "react";
import {
  activateSessionWithBootstrapToken,
  fetchCurrentSession,
  fetchPinSessionStatus,
  isBootstrapTokenActivationError,
} from "../api/authApi";
import { SessionModel } from "../api/types";
import { clearAccessToken } from "../auth/accessToken";
import { consumeBootstrapTokenFromUrl, setBootstrapToken } from "../auth/bootstrapToken";
import { getRequestContext } from "../config/requestContext";
import {
  TerminalActivationEntryMode,
  TerminalActivationPage,
  TerminalActivationSuccessState,
} from "../pages/TerminalActivationPage";
import { appStore } from "../store/useAppStore";
import { wsClient } from "../ws/wsClient";
import { syncRealtimeSession } from "./realtime";

const ACTIVATION_SUCCESS_HOLD_MS = 2200;

export function AppBootstrap({ children }: PropsWithChildren) {
  const [activationRequired, setActivationRequired] = useState(false);
  const [activationLoading, setActivationLoading] = useState(false);
  const [activationSuccess, setActivationSuccess] = useState<TerminalActivationSuccessState | null>(
    null,
  );

  const completeSession = useCallback(
    async (
      data: SessionModel,
      active: () => boolean,
      options?: { preserveActivationView?: boolean },
    ) => {
      if (!active()) {
        return;
      }
      appStore.setSessionData(data);
      appStore.setPinState({
        active: data.pinSessionActive,
        expiresAt: data.pinSessionExpiresAt,
        remainingLockSeconds: 0,
      });
      syncRealtimeSession(data);

      const pinStatus = await fetchPinSessionStatus();
      if (!active()) {
        return;
      }
      appStore.setPinState({
        active: pinStatus.pin_session_active,
        expiresAt: pinStatus.pin_session_expires_at,
        remainingLockSeconds: pinStatus.remaining_lock_seconds,
      });
      if (!options?.preserveActivationView) {
        setActivationRequired(false);
      }
    },
    [],
  );

  const setBootError = useCallback((error: unknown) => {
    clearAccessToken();
    const message = error instanceof Error ? error.message : "终端启动失败，请稍后重试。";
    appStore.setSessionError(message);
    if (isBootstrapTokenActivationError(error)) {
      if (
        error.reason === "missing" ||
        error.reason === "expired" ||
        error.reason === "invalid" ||
        error.reason === "malformed"
      ) {
        setBootstrapToken(null);
      }
      setActivationSuccess(null);
      setActivationRequired(true);
    }
  }, []);

  useEffect(() => {
    if (!activationSuccess) {
      return;
    }
    const timer = window.setTimeout(() => {
      setActivationSuccess(null);
      setActivationRequired(false);
    }, ACTIVATION_SUCCESS_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [activationSuccess]);

  const finishActivation = useCallback(
    async (
      bootstrapToken: string,
      source: TerminalActivationEntryMode,
      active: () => boolean,
    ) => {
      const data = await activateSessionWithBootstrapToken(bootstrapToken);
      setBootstrapToken(bootstrapToken);
      await completeSession(data, active, { preserveActivationView: true });
      if (!active()) {
        return;
      }
      setActivationSuccess({
        destinationLabel: "首页",
        mode: source,
      });
      setActivationRequired(true);
    },
    [completeSession],
  );

  useEffect(() => {
    let active = true;

    void (async () => {
      appStore.setSessionLoading();
      try {
        const deliveredBootstrapToken = consumeBootstrapTokenFromUrl();
        if (deliveredBootstrapToken) {
          if (active) {
            setActivationRequired(true);
            setActivationLoading(true);
          }
          await finishActivation(deliveredBootstrapToken, "scan", () => active);
          return;
        }
        const data = await fetchCurrentSession();
        await completeSession(data, () => active);
      } catch (error) {
        if (active) {
          setBootError(error);
        }
      } finally {
        if (active) {
          setActivationLoading(false);
        }
      }
    })();

    return () => {
      active = false;
      wsClient.close();
      clearAccessToken();
      appStore.setRealtimeState({
        connectionStatus: "idle",
        lastEventType: null,
        lastSequence: null,
        notice: null,
        reconnectAttempt: 0,
      });
    };
  }, [completeSession, finishActivation, setBootError]);

  async function handleActivate(
    bootstrapToken: string,
    mode: TerminalActivationEntryMode,
  ) {
    setActivationLoading(true);
    appStore.setSessionLoading();
    try {
      await finishActivation(bootstrapToken, mode, () => true);
    } catch (error) {
      setBootError(error);
    } finally {
      setActivationLoading(false);
    }
  }

  if (activationRequired) {
    return (
      <TerminalActivationPage
        terminalId={getRequestContext().terminalId}
        error={appStore.getSnapshot().session.error}
        loading={activationLoading}
        onActivate={handleActivate}
        onContinueAfterSuccess={() => {
          setActivationSuccess(null);
          setActivationRequired(false);
        }}
        successState={activationSuccess}
      />
    );
  }

  return <>{children}</>;
}
