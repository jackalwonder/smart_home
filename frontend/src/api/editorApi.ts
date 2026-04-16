import { apiRequest } from "./httpClient";
import {
  EditorDraftDto,
  EditorPublishDto,
  EditorPublishInput,
  EditorDraftSaveDto,
  EditorDraftSaveInput,
  EditorSessionDto,
} from "./types";

export function createEditorSession() {
  return apiRequest<EditorSessionDto>("/api/v1/editor/sessions", {
    method: "POST",
    body: JSON.stringify({
      takeover_if_locked: false,
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

export function publishEditorDraft(input: EditorPublishInput) {
  return apiRequest<EditorPublishDto>("/api/v1/editor/publish", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
