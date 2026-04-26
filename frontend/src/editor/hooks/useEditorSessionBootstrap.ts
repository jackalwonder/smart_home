import { useEffect } from "react";
import { fetchEditorDraft } from "../../api/editorApi";
import { appStore } from "../../store/useAppStore";
import type { EditorActionKind } from "../editorWorkbenchNotices";

interface UseEditorSessionBootstrapOptions {
  applyEditorDraft: (input: Awaited<ReturnType<typeof fetchEditorDraft>>) => void;
  clearEditorFeedback: () => void;
  handleEditorActionError: (error: unknown, action: EditorActionKind) => Promise<void>;
  openEditableSession: (options?: { silent?: boolean }) => Promise<unknown>;
  pinSessionActive: boolean;
  terminalId?: string | null;
}

export function useEditorSessionBootstrap({
  applyEditorDraft,
  clearEditorFeedback,
  handleEditorActionError,
  openEditableSession,
  pinSessionActive,
  terminalId,
}: UseEditorSessionBootstrapOptions) {
  useEffect(() => {
    if (!terminalId) {
      return;
    }

    let active = true;

    void (async () => {
      appStore.setEditorLoading();
      appStore.setEditorDraftLoading();

      try {
        if (pinSessionActive) {
          await openEditableSession({ silent: true });
          return;
        }

        const draft = await fetchEditorDraft();
        if (!active) {
          return;
        }
        appStore.setEditorSession({
          lockStatus: draft.lock_status,
          leaseId: null,
          leaseExpiresAt: null,
          heartbeatIntervalSeconds: null,
          lockedByTerminalId: null,
        });
        applyEditorDraft(draft);
        clearEditorFeedback();
      } catch (error) {
        if (!active) {
          return;
        }
        await handleEditorActionError(error, "acquire");
      }
    })();

    return () => {
      active = false;
    };
  }, [
    applyEditorDraft,
    clearEditorFeedback,
    handleEditorActionError,
    openEditableSession,
    pinSessionActive,
    terminalId,
  ]);
}
