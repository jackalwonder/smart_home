import { PropsWithChildren, useEffect } from "react";
import { fetchCurrentSession, fetchPinSessionStatus } from "../api/authApi";
import { appStore } from "../store/useAppStore";
import { syncRealtimeSession } from "./realtime";
import { wsClient } from "../ws/wsClient";

export function AppBootstrap({ children }: PropsWithChildren) {
  useEffect(() => {
    let active = true;

    void (async () => {
      appStore.setSessionLoading();
      try {
        const data = await fetchCurrentSession();
        if (!active) {
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
        if (!active) {
          return;
        }
        appStore.setPinState({
          active: pinStatus.pin_session_active,
          expiresAt: pinStatus.pin_session_expires_at,
          remainingLockSeconds: pinStatus.remaining_lock_seconds,
        });
      } catch (error) {
        if (!active) {
          return;
        }
        const message = error instanceof Error ? error.message : "启动会话加载失败";
        appStore.setSessionError(message);
      }
    })();

    return () => {
      active = false;
      wsClient.close();
      appStore.setRealtimeState({
        connectionStatus: "idle",
        lastEventType: null,
        lastSequence: null,
      });
    };
  }, []);

  return <>{children}</>;
}
