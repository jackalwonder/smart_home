import { useSyncExternalStore } from "react";
import { SessionModel } from "../api/types";
import { WsEvent, WsEventType } from "../ws/types";

export type AsyncStatus = "idle" | "loading" | "success" | "error";

interface SessionState {
  status: AsyncStatus;
  data: SessionModel | null;
  error: string | null;
}

interface PinState {
  status: AsyncStatus;
  active: boolean;
  expiresAt: string | null;
  remainingLockSeconds: number;
  error: string | null;
}

interface RealtimeState {
  connectionStatus: "idle" | "connecting" | "connected" | "disconnected";
  lastSequence: number | null;
  lastEventType: WsEventType | null;
}

interface HomeState {
  status: AsyncStatus;
  data: Record<string, unknown> | null;
  error: string | null;
}

interface SettingsState {
  status: AsyncStatus;
  data: Record<string, unknown> | null;
  error: string | null;
}

interface EditorState {
  status: AsyncStatus;
  lockStatus: string | null;
  leaseId: string | null;
  draftStatus: AsyncStatus;
  draft: Record<string, unknown> | null;
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

let state: AppState = {
  session: { status: "idle", data: null, error: null },
  pin: {
    status: "idle",
    active: false,
    expiresAt: null,
    remainingLockSeconds: 0,
    error: null,
  },
  realtime: { connectionStatus: "idle", lastSequence: null, lastEventType: null },
  home: { status: "idle", data: null, error: null },
  settings: { status: "idle", data: null, error: null },
  editor: {
    status: "idle",
    lockStatus: null,
    leaseId: null,
    draftStatus: "idle",
    draft: null,
    draftVersion: null,
    baseLayoutVersion: null,
    readonly: true,
    error: null,
  },
  wsEvents: [],
};

const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

function setState(recipe: (current: AppState) => AppState) {
  state = recipe(state);
  emitChange();
}

export const appStore = {
  getSnapshot: () => state,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  setSessionLoading: () =>
    setState((current) => ({
      ...current,
      session: { ...current.session, status: "loading", error: null },
    })),
  setSessionData: (session: SessionModel) =>
    setState((current) => ({
      ...current,
      session: { status: "success", data: session, error: null },
    })),
  setSessionError: (message: string) =>
    setState((current) => ({
      ...current,
      session: { ...current.session, status: "error", error: message },
    })),
  setPinLoading: () =>
    setState((current) => ({
      ...current,
      pin: { ...current.pin, status: "loading", error: null },
    })),
  setPinState: (payload: {
    active: boolean;
    expiresAt: string | null;
    remainingLockSeconds: number;
  }) =>
    setState((current) => ({
      ...current,
      pin: {
        status: "success",
        active: payload.active,
        expiresAt: payload.expiresAt,
        remainingLockSeconds: payload.remainingLockSeconds,
        error: null,
      },
      session: current.session.data
        ? {
            ...current.session,
            data: {
              ...current.session.data,
              pinSessionActive: payload.active,
              pinSessionExpiresAt: payload.expiresAt,
            },
          }
        : current.session,
    })),
  setPinError: (message: string) =>
    setState((current) => ({
      ...current,
      pin: { ...current.pin, status: "error", error: message },
    })),
  setRealtimeState: (payload: Partial<RealtimeState>) =>
    setState((current) => ({
      ...current,
      realtime: { ...current.realtime, ...payload },
    })),
  pushWsEvent: (event: WsEvent) =>
    setState((current) => ({
      ...current,
      wsEvents: [event, ...current.wsEvents].slice(0, 20),
    })),
  setHomeLoading: () =>
    setState((current) => ({
      ...current,
      home: { ...current.home, status: "loading", error: null },
    })),
  setHomeData: (data: Record<string, unknown>) =>
    setState((current) => ({
      ...current,
      home: { status: "success", data, error: null },
    })),
  setHomeError: (message: string) =>
    setState((current) => ({
      ...current,
      home: { ...current.home, status: "error", error: message },
    })),
  setSettingsLoading: () =>
    setState((current) => ({
      ...current,
      settings: { ...current.settings, status: "loading", error: null },
    })),
  setSettingsData: (data: Record<string, unknown>) =>
    setState((current) => ({
      ...current,
      settings: { status: "success", data, error: null },
    })),
  setSettingsError: (message: string) =>
    setState((current) => ({
      ...current,
      settings: { ...current.settings, status: "error", error: message },
    })),
  setEditorLoading: () =>
    setState((current) => ({
      ...current,
      editor: { ...current.editor, status: "loading", error: null },
    })),
  setEditorSession: (payload: { lockStatus: string | null; leaseId: string | null }) =>
    setState((current) => ({
      ...current,
      editor: {
        ...current.editor,
        status: "success",
        lockStatus: payload.lockStatus,
        leaseId: payload.leaseId,
        error: null,
      },
    })),
  setEditorDraftLoading: () =>
    setState((current) => ({
      ...current,
      editor: { ...current.editor, draftStatus: "loading" },
    })),
  setEditorDraftData: (payload: {
    draft: Record<string, unknown> | null;
    draftVersion: string | null;
    baseLayoutVersion: string | null;
    readonly: boolean;
    lockStatus: string | null;
  }) =>
    setState((current) => ({
      ...current,
      editor: {
        ...current.editor,
        draftStatus: "success",
        draft: payload.draft,
        draftVersion: payload.draftVersion,
        baseLayoutVersion: payload.baseLayoutVersion,
        readonly: payload.readonly,
        lockStatus: payload.lockStatus,
      },
    })),
  setEditorError: (message: string) =>
    setState((current) => ({
      ...current,
      editor: {
        ...current.editor,
        status: "error",
        draftStatus:
          current.editor.draftStatus === "loading" ? "error" : current.editor.draftStatus,
        error: message,
      },
    })),
};

export function useAppStore<T>(selector: (state: AppState) => T) {
  return useSyncExternalStore(appStore.subscribe, () => selector(appStore.getSnapshot()));
}
