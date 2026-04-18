import { PropsWithChildren, useCallback, useEffect, useState } from "react";
import {
  activateSessionWithBootstrapToken,
  fetchCurrentSession,
  fetchPinSessionStatus,
  isBootstrapTokenActivationError,
} from "../api/authApi";
import { SessionModel } from "../api/types";
import { appStore } from "../store/useAppStore";
import { syncRealtimeSession } from "./realtime";
import { wsClient } from "../ws/wsClient";
import { clearAccessToken } from "../auth/accessToken";
import { consumeBootstrapTokenFromUrl, setBootstrapToken } from "../auth/bootstrapToken";
import { TerminalActivationPage } from "../pages/TerminalActivationPage";

export function AppBootstrap({ children }: PropsWithChildren) {
  const [activationRequired, setActivationRequired] = useState(false);
  const [activationLoading, setActivationLoading] = useState(false);

  const completeSession = useCallback(async (data: SessionModel, active: () => boolean) => {
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
    setActivationRequired(false);
  }, []);

  const setBootError = useCallback((error: unknown) => {
    clearAccessToken();
    const message = error instanceof Error ? error.message : "启动会话加载失败";
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
      setActivationRequired(true);
    }
  }, []);

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
          const data = await activateSessionWithBootstrapToken(deliveredBootstrapToken);
          setBootstrapToken(deliveredBootstrapToken);
          await completeSession(data, () => active);
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
        reconnectAttempt: 0,
        notice: null,
      });
    };
  }, [completeSession, setBootError]);

  async function handleActivate(bootstrapToken: string) {
    setActivationLoading(true);
    appStore.setSessionLoading();
    try {
      const data = await activateSessionWithBootstrapToken(bootstrapToken);
      setBootstrapToken(bootstrapToken);
      await completeSession(data, () => true);
    } catch (error) {
      setBootError(error);
    } finally {
      setActivationLoading(false);
    }
  }

  if (activationRequired) {
    return (
      <TerminalActivationPage
        error={appStore.getSnapshot().session.error}
        loading={activationLoading}
        onActivate={handleActivate}
      />
    );
  }

  return <>{children}</>;
}
