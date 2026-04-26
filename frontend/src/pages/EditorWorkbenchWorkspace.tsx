import { EditorCanvasWorkspace } from "../components/editor/EditorCanvasWorkspace";
import { EditorCommandBar } from "../components/editor/EditorCommandBar";
import { EditorInspector } from "../components/editor/EditorInspector";
import { EditorPublishSummary } from "../components/editor/EditorPublishSummary";
import { EditorRealtimeFeed } from "../components/editor/EditorRealtimeFeed";
import { EditorToolbox } from "../components/editor/EditorToolbox";
import { resolveEditorNoticeAction } from "./editorWorkbenchNoticeActions";
import { useEditorWorkbenchController } from "./useEditorWorkbenchController";

interface EditorWorkbenchWorkspaceProps {
  embedded?: boolean;
}

export function EditorWorkbenchWorkspace({ embedded = false }: EditorWorkbenchWorkspaceProps) {
  const controller = useEditorWorkbenchController(embedded);
  const notice = controller.editorNotice;

  return (
    <section className={embedded ? "editor-workspace-embedded" : "page page--editor"}>
      {notice ? (
        <section className={`editor-recovery editor-recovery--${notice.tone}`}>
          <div>
            <strong>{notice.title}</strong>
            <p>{notice.detail}</p>
          </div>
          <div className="badge-row">
            {notice.actions?.map((action) => {
              const resolved = resolveEditorNoticeAction(action, controller);
              return resolved.enabled ? (
                <span key={action}>
                  <button
                    className={`button button--${resolved.kind}`}
                    onClick={resolved.run}
                    type="button"
                  >
                    {resolved.label}
                  </button>
                </span>
              ) : null;
            })}
          </div>
        </section>
      ) : null}
      <EditorCommandBar {...controller.commandBarProps} />
      <EditorPublishSummary {...controller.publishSummaryProps} />
      <div className="editor-workbench">
        <EditorToolbox {...controller.toolboxProps} />
        <EditorCanvasWorkspace {...controller.canvasProps} />
        <EditorInspector {...controller.inspectorProps} />
      </div>
      <EditorRealtimeFeed rows={controller.eventRows} />
    </section>
  );
}
