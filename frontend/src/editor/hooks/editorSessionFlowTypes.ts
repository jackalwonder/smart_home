import type { EditorDraftState } from "../editorDraftState";
import type { EditorDraftLayoutDto } from "../../api/types";
import type { WsEvent } from "../../ws/types";

export interface EditorSessionFlowState {
  lockStatus: string | null;
  leaseId: string | null;
  leaseExpiresAt: string | null;
  heartbeatIntervalSeconds: number | null;
  lockedByTerminalId: string | null;
  draft: EditorDraftLayoutDto | null;
  draftVersion: string | null;
  baseLayoutVersion: string | null;
  readonly: boolean;
}

export interface UseEditorSessionFlowOptions {
  canEdit: boolean;
  draftState: EditorDraftState;
  editor: EditorSessionFlowState;
  events: WsEvent[];
  pinActive: boolean;
  pinSessionActive: boolean;
  resetSelection: () => void;
  terminalId?: string | null;
}

export type DraftLockLostEvent = Extract<WsEvent, { event_type: "draft_lock_lost" }>;
export type DraftTakenOverEvent = Extract<WsEvent, { event_type: "draft_taken_over" }>;
export type VersionConflictDetectedEvent = Extract<
  WsEvent,
  { event_type: "version_conflict_detected" }
>;

export function isDraftLockLostEvent(event: WsEvent): event is DraftLockLostEvent {
  return event.event_type === "draft_lock_lost";
}

export function isDraftTakenOverEvent(event: WsEvent): event is DraftTakenOverEvent {
  return event.event_type === "draft_taken_over";
}

export function isVersionConflictDetectedEvent(
  event: WsEvent,
): event is VersionConflictDetectedEvent {
  return event.event_type === "version_conflict_detected";
}
