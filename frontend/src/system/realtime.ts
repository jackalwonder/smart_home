import { SessionModel } from "../api/types";
import { appStore } from "../store/useAppStore";
import { wsClient } from "../ws/wsClient";

export function syncRealtimeSession(session: SessionModel) {
  if (!session.pinSessionActive) {
    wsClient.close();
    appStore.setRealtimeState({
      connectionStatus: "idle",
      lastEventType: null,
      lastSequence: null,
    });
    return;
  }

  wsClient.connect({
    session,
    onConnectionChange: (connectionStatus) =>
      appStore.setRealtimeState({ connectionStatus }),
    onEvent: (event) =>
      appStore.setRealtimeState({
        connectionStatus: "connected",
        lastEventType: event.event_type,
        lastSequence: event.sequence,
      }),
  });
}
