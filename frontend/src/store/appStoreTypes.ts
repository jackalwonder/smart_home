import type {
  EditorDraftLayoutDto,
  HomeOverviewDto,
  SessionModel,
  SettingsDto,
} from "../api/types";
import type { WsEvent, WsEventType } from "../ws/types";

export type { EditorDraftLayoutDto };

export type AsyncStatus = "idle" | "loading" | "success" | "error";

export interface SessionState {
  status: AsyncStatus;
  data: SessionModel | null;
  error: string | null;
}

export interface PinState {
  status: AsyncStatus;
  active: boolean;
  expiresAt: string | null;
  remainingLockSeconds: number;
  error: string | null;
}

export interface RealtimeState {
  connectionStatus: "idle" | "connecting" | "connected" | "reconnecting" | "disconnected";
  lastSequence: number | null;
  lastEventType: WsEventType | null;
  reconnectAttempt: number;
  notice: string | null;
}

export interface HomeState {
  status: AsyncStatus;
  data: HomeOverviewDto | null;
  error: string | null;
}

export interface SettingsState {
  status: AsyncStatus;
  data: SettingsDto | null;
  error: string | null;
}

export interface EditorState {
  status: AsyncStatus;
  lockStatus: string | null;
  leaseId: string | null;
  leaseExpiresAt: string | null;
  heartbeatIntervalSeconds: number | null;
  lockedByTerminalId: string | null;
  draftStatus: AsyncStatus;
  draft: EditorDraftLayoutDto | null;
  draftVersion: string | null;
  baseLayoutVersion: string | null;
  readonly: boolean;
  error: string | null;
}

export interface AppState {
  session: SessionState;
  pin: PinState;
  realtime: RealtimeState;
  home: HomeState;
  settings: SettingsState;
  editor: EditorState;
  wsEvents: WsEvent[];
}
