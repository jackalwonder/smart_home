import { API_BASE_URL } from "../api/httpClient";
import { SessionModel } from "../api/types";
import { getAccessToken } from "../auth/accessToken";
import { appStore } from "../store/useAppStore";
import { WsClientMessage, WsEvent } from "./types";

interface ConnectOptions {
  session: SessionModel;
  onConnectionChange?: (status: "connecting" | "connected" | "disconnected") => void;
  onEvent?: (event: WsEvent) => void;
}

class WsClient {
  private socket: WebSocket | null = null;
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

  connect(options: ConnectOptions) {
    this.close();
    options.onConnectionChange?.("connecting");

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

    this.socket = new WebSocket(url.toString());

    this.socket.addEventListener("open", () => {
      options.onConnectionChange?.("connected");
    });

    this.socket.addEventListener("message", (message) => {
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

    this.socket.addEventListener("close", () => {
      options.onConnectionChange?.("disconnected");
    });

    this.socket.addEventListener("error", () => {
      options.onConnectionChange?.("disconnected");
    });

    return () => this.close();
  }

  close() {
    if (!this.socket) {
      return;
    }
    this.socket.close();
    this.socket = null;
  }
}

export const wsClient = new WsClient();
