import { apiRequest } from "./httpClient";
import {
  EditorDraftDiscardDto,
  EditorDraftDiffDto,
  EditorDraftDiffInput,
  EditorDraftDiscardInput,
  EditorDraftDto,
  EditorHeartbeatDto,
  EditorPublishDto,
  EditorPublishInput,
  EditorDraftSaveDto,
  EditorDraftSaveInput,
  EditorSessionDto,
  EditorSessionInput,
  EditorTakeoverDto,
} from "./types";

export function createEditorSession(input?: Partial<EditorSessionInput>) {
  return apiRequest<EditorSessionDto>("/api/v1/editor/sessions", {
    method: "POST",
    body: JSON.stringify({
      takeover_if_locked: false,
      ...input,
    }),
  });
}

export function fetchEditorDraft(leaseId?: string | null) {
  const search = leaseId ? `?lease_id=${encodeURIComponent(leaseId)}` : "";
  return apiRequest<EditorDraftDto>(`/api/v1/editor/draft${search}`);
}

export function saveEditorDraft(input: EditorDraftSaveInput) {
  return apiRequest<EditorDraftSaveDto>("/api/v1/editor/draft", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function discardEditorDraft(input: EditorDraftDiscardInput) {
  return apiRequest<EditorDraftDiscardDto>("/api/v1/editor/draft", {
    method: "DELETE",
    body: JSON.stringify(input),
  });
}

export function previewEditorDraftDiff(input: EditorDraftDiffInput) {
  return apiRequest<EditorDraftDiffDto>("/api/v1/editor/draft/diff", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function publishEditorDraft(input: EditorPublishInput) {
  return apiRequest<EditorPublishDto>("/api/v1/editor/publish", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function heartbeatEditorSession(leaseId: string) {
  return apiRequest<EditorHeartbeatDto>(
    `/api/v1/editor/sessions/${encodeURIComponent(leaseId)}/heartbeat`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export function takeoverEditorSession(leaseId: string) {
  return apiRequest<EditorTakeoverDto>(
    `/api/v1/editor/sessions/${encodeURIComponent(leaseId)}/takeover`,
    {
      method: "POST",
      body: JSON.stringify({ takeover_if_locked: true }),
    },
  );
}
