import { API_BASE_URL } from "../api/httpClient";
import { SessionModel } from "../api/types";
import { getAccessToken } from "../auth/accessToken";
import { appStore } from "../store/useAppStore";
import { WsClientMessage, WsEvent } from "./types";

type RealtimeConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

interface ConnectOptions {
  session: SessionModel;
  onConnectionChange?: (payload: {
    status: RealtimeConnectionStatus;
    reconnectAttempt: number;
    recovered: boolean;
  }) => void;
  onEvent?: (event: WsEvent) => void;
  onRecovered?: () => void;
}

declare global {
  interface Window {
    __smartHomeRealtime?: {
      forceDisconnect: () => void;
    };
  }
}

class WsClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof window.setTimeout> | null = null;
  private options: ConnectOptions | null = null;
  private manualClose = false;
  private reconnectAttempt = 0;
  private hasConnectedOnce = false;
  private lastEventId: string | null = null;
  private seenEventIds: string[] = [];

  private rememberEvent(eventId: string) {
    if (this.seenEventIds.includes(eventId)) {
      return false;
    }
    this.seenEventIds = [eventId, ...this.seenEventIds].slice(0, 200);
    return true;
  }

  private send(message: WsClientMessage) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify(message));
  }

  private emitConnectionChange(
    status: RealtimeConnectionStatus,
    options: ConnectOptions,
    recovered = false,
  ) {
    options.onConnectionChange?.({
      status,
      reconnectAttempt: this.reconnectAttempt,
      recovered,
    });
  }

  private nextReconnectDelayMs() {
    const backoffSteps = [1_000, 2_000, 4_000, 8_000, 15_000];
    const index = Math.min(this.reconnectAttempt - 1, backoffSteps.length - 1);
    return backoffSteps[index];
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer === null) {
      return;
    }
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private openSocket(options: ConnectOptions, status: RealtimeConnectionStatus) {
    this.emitConnectionChange(status, options);

    const wsBaseUrl = API_BASE_URL.replace(/^http/, "ws");
    const url = new URL(wsBaseUrl);
    const accessToken = options.session.accessToken || getAccessToken();
    url.pathname = "/ws";
    if (accessToken) {
      url.searchParams.set("access_token", accessToken);
    }
    if (this.lastEventId) {
      url.searchParams.set("last_event_id", this.lastEventId);
    }

    const socket = new WebSocket(url.toString());
    this.socket = socket;
    if (typeof window !== "undefined") {
      window.__smartHomeRealtime = {
        forceDisconnect: () => this.forceDisconnectForTesting(),
      };
    }

    socket.addEventListener("open", () => {
      if (this.socket !== socket) {
        return;
      }
      const recovered = this.hasConnectedOnce;
      this.hasConnectedOnce = true;
      this.reconnectAttempt = 0;
      this.emitConnectionChange("connected", options, recovered);
      if (recovered) {
        options.onRecovered?.();
      }
    });

    socket.addEventListener("message", (message) => {
      if (this.socket !== socket) {
        return;
      }
      try {
        const event = JSON.parse(message.data) as WsEvent;
        this.lastEventId = event.event_id;
        this.send({ type: "ack", event_id: event.event_id });
        if (!this.rememberEvent(event.event_id)) {
          return;
        }
        appStore.pushWsEvent(event);
        options.onEvent?.(event);
      } catch {
        // Malformed events are ignored because the server will resend unacked rows.
      }
    });

    socket.addEventListener("close", () => {
      if (this.socket !== socket) {
        return;
      }
      this.socket = null;
      if (this.manualClose) {
        this.emitConnectionChange("disconnected", options);
        return;
      }
      this.reconnectAttempt += 1;
      this.emitConnectionChange("reconnecting", options);
      const delay = this.nextReconnectDelayMs();
      this.clearReconnectTimer();
      this.reconnectTimer = window.setTimeout(() => {
        this.reconnectTimer = null;
        this.openSocket(options, "reconnecting");
      }, delay);
    });

    socket.addEventListener("error", () => {
      if (this.socket !== socket || socket.readyState === WebSocket.CLOSED) {
        return;
      }
      this.emitConnectionChange(
        this.hasConnectedOnce || this.reconnectAttempt > 0 ? "reconnecting" : "connecting",
        options,
      );
    });
  }

  connect(options: ConnectOptions) {
    this.close();
    this.options = options;
    this.manualClose = false;
    this.reconnectAttempt = 0;
    this.openSocket(options, "connecting");
    return () => this.close();
  }

  forceDisconnectForTesting() {
    if (!this.socket) {
      return;
    }
    this.manualClose = false;
    this.socket.close();
  }

  close() {
    this.manualClose = true;
    this.clearReconnectTimer();
    this.reconnectAttempt = 0;
    if (!this.socket) {
      return;
    }
    this.socket.close();
    this.socket = null;
  }
}

export const wsClient = new WsClient();
