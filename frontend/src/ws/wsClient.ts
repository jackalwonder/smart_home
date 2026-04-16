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
        appStore.pushWsEvent(event);
        this.send({ type: "ack", event_id: event.event_id });
        options.onEvent?.(event);
      } catch {
        // Ignore malformed events in the initial scaffold.
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
