import type { SessionModel } from "../api/types";
import type { WsEvent } from "../ws/types";
import type { AppState, RealtimeState } from "./appStoreTypes";

type SetAppState = (recipe: (current: AppState) => AppState) => void;

export function createInitialAppState(): AppState {
  return {
    session: { status: "idle", data: null, error: null },
    pin: {
      status: "idle",
      active: false,
      expiresAt: null,
      remainingLockSeconds: 0,
      error: null,
    },
    realtime: {
      connectionStatus: "idle",
      lastSequence: null,
      lastEventType: null,
      reconnectAttempt: 0,
      notice: null,
    },
    home: { status: "idle", data: null, error: null },
    settings: { status: "idle", data: null, error: null },
    editor: {
      status: "idle",
      lockStatus: null,
      leaseId: null,
      leaseExpiresAt: null,
      heartbeatIntervalSeconds: null,
      lockedByTerminalId: null,
      draftStatus: "idle",
      draft: null,
      draftVersion: null,
      baseLayoutVersion: null,
      readonly: true,
      error: null,
    },
    wsEvents: [],
  };
}

export function createSessionActions(setState: SetAppState) {
  return {
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
  };
}

export function createPinActions(setState: SetAppState) {
  return {
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
  };
}

export function createRealtimeActions(setState: SetAppState) {
  return {
    setRealtimeState: (payload: Partial<RealtimeState>) =>
      setState((current) => ({
        ...current,
        realtime: { ...current.realtime, ...payload },
      })),
    clearRealtimeNotice: () =>
      setState((current) => ({
        ...current,
        realtime: { ...current.realtime, notice: null },
      })),
    pushWsEvent: (event: WsEvent) =>
      setState((current) => ({
        ...current,
        wsEvents: [event, ...current.wsEvents].slice(0, 20),
      })),
  };
}

export function createHomeActions(setState: SetAppState) {
  return {
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
  };
}

export function createSettingsActions(setState: SetAppState) {
  return {
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
  };
}

export function createEditorActions(setState: SetAppState) {
  return {
    setEditorLoading: () =>
      setState((current) => ({
        ...current,
        editor: { ...current.editor, status: "loading", error: null },
      })),
    setEditorSession: (payload: {
      lockStatus: string | null;
      leaseId: string | null;
      leaseExpiresAt?: string | null;
      heartbeatIntervalSeconds?: number | null;
      lockedByTerminalId?: string | null;
    }) =>
      setState((current) => ({
        ...current,
        editor: {
          ...current.editor,
          status: "success",
          lockStatus: payload.lockStatus,
          leaseId: payload.leaseId,
          leaseExpiresAt:
            payload.leaseExpiresAt === undefined
              ? current.editor.leaseExpiresAt
              : payload.leaseExpiresAt,
          heartbeatIntervalSeconds:
            payload.heartbeatIntervalSeconds === undefined
              ? current.editor.heartbeatIntervalSeconds
              : payload.heartbeatIntervalSeconds,
          lockedByTerminalId:
            payload.lockedByTerminalId === undefined
              ? current.editor.lockedByTerminalId
              : payload.lockedByTerminalId,
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
    clearEditorError: () =>
      setState((current) => ({
        ...current,
        editor: {
          ...current.editor,
          error: null,
        },
      })),
  };
}
