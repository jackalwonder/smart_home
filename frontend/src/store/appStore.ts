import { useSyncExternalStore } from "react";
import {
  createEditorActions,
  createHomeActions,
  createInitialAppState,
  createPinActions,
  createRealtimeActions,
  createSessionActions,
  createSettingsActions,
} from "./appStoreSlices";
import type { AppState } from "./appStoreTypes";

export type { AppState, AsyncStatus } from "./appStoreTypes";

let state: AppState = createInitialAppState();

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
  ...createSessionActions(setState),
  ...createPinActions(setState),
  ...createRealtimeActions(setState),
  ...createHomeActions(setState),
  ...createSettingsActions(setState),
  ...createEditorActions(setState),
};

export function useAppStore<T>(selector: (state: AppState) => T) {
  return useSyncExternalStore(appStore.subscribe, () => selector(appStore.getSnapshot()));
}
