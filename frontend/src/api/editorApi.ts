import { apiRequest } from "./httpClient";
import { EditorDraftDto, EditorSessionDto } from "./types";

export function createEditorSession(terminalId: string) {
  return apiRequest<EditorSessionDto>("/api/v1/editor/sessions", {
    method: "POST",
    body: JSON.stringify({
      terminal_id: terminalId,
      takeover_if_locked: false,
    }),
  });
}

export function fetchEditorDraft(leaseId?: string | null) {
  const search = leaseId ? `?lease_id=${encodeURIComponent(leaseId)}` : "";
  return apiRequest<EditorDraftDto>(`/api/v1/editor/draft${search}`);
}
