import { API_BASE_URL } from "../api/httpClient";
import { SessionModel, WsEvent } from "../api/types";
import { getRequestContext } from "../config/requestContext";
import { appStore } from "../store/useAppStore";

interface ConnectOptions {
  session: SessionModel;
  onConnectionChange?: (status: "connecting" | "connected" | "disconnected") => void;
  onEvent?: (event: WsEvent) => void;
}

class WsClient {
  private socket: WebSocket | null = null;

  connect(options: ConnectOptions) {
    this.close();
    options.onConnectionChange?.("connecting");

    const wsBaseUrl = API_BASE_URL.replace(/^http/, "ws");
    const url = new URL(wsBaseUrl);
    const fallbackContext = getRequestContext();
    url.pathname = "/ws";
    url.searchParams.set("home_id", options.session.homeId || fallbackContext.homeId);
    url.searchParams.set(
      "terminal_id",
      options.session.terminalId || fallbackContext.terminalId,
    );

    this.socket = new WebSocket(url.toString());

    this.socket.addEventListener("open", () => {
      options.onConnectionChange?.("connected");
    });

    this.socket.addEventListener("message", (message) => {
      try {
        const event = JSON.parse(message.data) as WsEvent;
        appStore.pushWsEvent(event);
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
