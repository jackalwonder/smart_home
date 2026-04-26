import { useEffect, useRef } from "react";
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
  const handlersRef = useRef({
    applyEditorDraft,
    clearEditorFeedback,
    handleEditorActionError,
    openEditableSession,
  });
  const initializedKeyRef = useRef<string | null>(null);
  const bootstrapKey = terminalId
    ? `${terminalId}:${pinSessionActive ? "pin-active" : "pin-inactive"}`
    : null;

  useEffect(() => {
    handlersRef.current = {
      applyEditorDraft,
      clearEditorFeedback,
      handleEditorActionError,
      openEditableSession,
    };
  }, [applyEditorDraft, clearEditorFeedback, handleEditorActionError, openEditableSession]);

  useEffect(() => {
    if (!terminalId || !bootstrapKey) {
      initializedKeyRef.current = null;
      return;
    }

    if (initializedKeyRef.current === bootstrapKey) {
      return;
    }
    initializedKeyRef.current = bootstrapKey;

    let active = true;

    void (async () => {
      appStore.setEditorLoading();
      appStore.setEditorDraftLoading();

      try {
        if (pinSessionActive) {
          await handlersRef.current.openEditableSession({ silent: true });
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
        handlersRef.current.applyEditorDraft(draft);
        handlersRef.current.clearEditorFeedback();
      } catch (error) {
        if (!active) {
          return;
        }
        await handlersRef.current.handleEditorActionError(error, "acquire");
      }
    })();

    return () => {
      active = false;
    };
  }, [bootstrapKey, pinSessionActive, terminalId]);
}
