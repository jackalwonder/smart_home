import { useEffect } from "react";
import { EditorCanvas } from "../components/editor/EditorCanvas";
import { EditorStatusPanel } from "../components/editor/EditorStatusPanel";
import { createEditorSession } from "../api/editorApi";
import { normalizeApiError } from "../api/httpClient";
import { appStore, useAppStore } from "../store/useAppStore";

export function EditorWorkbenchPage() {
  const session = useAppStore((state) => state.session);
  const editor = useAppStore((state) => state.editor);
  const terminalId = session.data?.terminalId;

  useEffect(() => {
    if (!terminalId) {
      return;
    }

    let active = true;

    void (async () => {
      appStore.setEditorLoading();
      try {
        const data = await createEditorSession(terminalId);
        if (!active) {
          return;
        }
        appStore.setEditorSession({
          lockStatus: data.lock_status,
          leaseId: data.lease_id,
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
  }, [terminalId]);

  return (
    <section className="page">
      <header className="page__header">
        <div>
          <span className="page__eyebrow">Editor</span>
          <h2>编辑态工作台</h2>
          <p>先建立 lease / heartbeat / draft / publish 的工作区壳层。</p>
        </div>
        <div className="page__badge-row">
          <span className="status-pill">{editor.status}</span>
          <span className="status-pill">
            lock_status: {editor.lockStatus ?? "-"}
          </span>
        </div>
      </header>
      <div className="editor-layout">
        <EditorCanvas />
        <EditorStatusPanel />
      </div>
      {editor.error ? <p className="page__error">{editor.error}</p> : null}
    </section>
  );
}
