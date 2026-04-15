import { useEffect } from "react";
import { EditorCanvasPanel } from "../components/editor/EditorCanvasPanel";
import { EditorLeasePanel } from "../components/editor/EditorLeasePanel";
import { fetchEditorDraft, createEditorSession } from "../api/editorApi";
import { normalizeApiError } from "../api/httpClient";
import { appStore, useAppStore } from "../store/useAppStore";

export function EditorWorkbenchWorkspace() {
  const session = useAppStore((state) => state.session);
  const editor = useAppStore((state) => state.editor);
  const terminalId = session.data?.terminalId;
  const pinSessionActive = session.data?.pinSessionActive ?? false;

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
          const lease = await createEditorSession(terminalId);
          if (!active) {
            return;
          }
          appStore.setEditorSession({
            lockStatus: lease.lock_status,
            leaseId: lease.lease_id,
          });

          const draft = await fetchEditorDraft(lease.lease_id);
          if (!active) {
            return;
          }
          appStore.setEditorDraftData({
            draft: draft.layout ?? null,
            draftVersion: draft.draft_version,
            baseLayoutVersion: draft.base_layout_version,
            readonly: draft.readonly,
            lockStatus: draft.lock_status,
          });
          return;
        }

        const draft = await fetchEditorDraft();
        if (!active) {
          return;
        }
        appStore.setEditorSession({
          lockStatus: draft.lock_status,
          leaseId: null,
        });
        appStore.setEditorDraftData({
          draft: draft.layout ?? null,
          draftVersion: draft.draft_version,
          baseLayoutVersion: draft.base_layout_version,
          readonly: draft.readonly,
          lockStatus: draft.lock_status,
        });
      } catch (error) {
        if (!active) {
          return;
        }
        appStore.setEditorError(normalizeApiError(error).message);
      }
    })();

    return () => {
      active = false;
    };
  }, [pinSessionActive, terminalId]);

  return (
    <section className="page">
      <header className="page__header">
        <div>
          <span className="page__eyebrow">Editor</span>
          <h2>Editor workbench</h2>
          <p>Draft preview always reads the live backend. Lease creation starts after PIN verify.</p>
        </div>
        <div className="page__badge-row">
          <span className="status-pill">{editor.status}</span>
          <span className="status-pill">lock_status: {editor.lockStatus ?? "-"}</span>
        </div>
      </header>

      <div className="editor-layout">
        <EditorCanvasPanel />
        <EditorLeasePanel />
      </div>

      {!pinSessionActive ? (
        <p className="page__hint">
          Verify the management PIN in the sidebar to request an editable draft lease.
        </p>
      ) : null}
      {editor.error ? <p className="page__error">{editor.error}</p> : null}
    </section>
  );
}
