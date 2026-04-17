import { fetchEditorDraft } from "../api/editorApi";
import { fetchHomeOverview } from "../api/homeApi";
import { normalizeApiError } from "../api/httpClient";
import { fetchSettings } from "../api/settingsApi";
import { SessionModel } from "../api/types";
import { appStore } from "../store/useAppStore";
import { wsClient } from "../ws/wsClient";
import type { WsEvent } from "../ws/types";

type SnapshotTarget = "editor" | "home" | "settings";

let pendingSnapshotTargets = new Set<SnapshotTarget>();
let snapshotRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let snapshotRefreshChain: Promise<void> = Promise.resolve();

function targetsForEvent(event: WsEvent): SnapshotTarget[] {
  switch (event.event_type) {
    case "backup_restore_completed":
      return ["home", "settings", "editor"];
    case "device_state_changed":
    case "energy_refresh_completed":
    case "energy_refresh_failed":
    case "ha_sync_degraded":
    case "ha_sync_recovered":
    case "media_state_changed":
    case "summary_updated":
      return ["home"];
    case "draft_lock_acquired":
    case "draft_lock_lost":
    case "draft_taken_over":
      return ["editor"];
    case "publish_succeeded":
      return ["home", "editor"];
    case "settings_updated":
      return ["home", "settings"];
    case "version_conflict_detected":
      return ["home", "settings", "editor"];
  }
  const exhaustiveEvent: never = event;
  return exhaustiveEvent;
}

async function refreshHomeSnapshot() {
  try {
    const data = await fetchHomeOverview();
    appStore.setHomeData(data as unknown as Record<string, unknown>);
  } catch (error) {
    appStore.setHomeError(normalizeApiError(error).message);
  }
}

async function refreshSettingsSnapshot() {
  try {
    const data = await fetchSettings();
    appStore.setSettingsData(data as unknown as Record<string, unknown>);
  } catch (error) {
    appStore.setSettingsError(normalizeApiError(error).message);
  }
}

async function refreshEditorSnapshot() {
  const editor = appStore.getSnapshot().editor;
  const editorHasLoaded =
    editor.status !== "idle" ||
    editor.draftStatus !== "idle" ||
    editor.leaseId !== null ||
    editor.draft !== null;

  if (!editorHasLoaded) {
    return;
  }

  try {
    const draft = await fetchEditorDraft(editor.leaseId).catch((error) => {
      if (!editor.leaseId) {
        throw error;
      }
      return fetchEditorDraft();
    });
    appStore.setEditorDraftData({
      draft: draft.layout ?? null,
      draftVersion: draft.draft_version,
      baseLayoutVersion: draft.base_layout_version,
      readonly: draft.readonly,
      lockStatus: draft.lock_status,
    });
  } catch (error) {
    appStore.setEditorError(normalizeApiError(error).message);
  }
}

async function refreshSnapshots(targets: SnapshotTarget[]) {
  await Promise.all([
    targets.includes("home") ? refreshHomeSnapshot() : Promise.resolve(),
    targets.includes("settings") ? refreshSettingsSnapshot() : Promise.resolve(),
    targets.includes("editor") ? refreshEditorSnapshot() : Promise.resolve(),
  ]);
}

function flushSnapshotRefreshes() {
  const targets = [...pendingSnapshotTargets];
  pendingSnapshotTargets = new Set();
  snapshotRefreshTimer = null;
  snapshotRefreshChain = snapshotRefreshChain
    .catch(() => undefined)
    .then(() => refreshSnapshots(targets));
}

function scheduleSnapshotRefresh(targets: SnapshotTarget[]) {
  if (targets.length === 0) {
    return;
  }

  targets.forEach((target) => pendingSnapshotTargets.add(target));
  if (snapshotRefreshTimer !== null) {
    return;
  }
  snapshotRefreshTimer = setTimeout(flushSnapshotRefreshes, 250);
}

function clearSnapshotRefreshQueue() {
  if (snapshotRefreshTimer !== null) {
    clearTimeout(snapshotRefreshTimer);
  }
  pendingSnapshotTargets = new Set();
  snapshotRefreshTimer = null;
}

export function syncRealtimeSession(session: SessionModel) {
  if (!session.accessToken && !session.pinSessionActive) {
    wsClient.close();
    clearSnapshotRefreshQueue();
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
    onEvent: (event) => {
      appStore.setRealtimeState({
        connectionStatus: "connected",
        lastEventType: event.event_type,
        lastSequence: event.sequence,
      });
      scheduleSnapshotRefresh(targetsForEvent(event));
    },
  });
}
