import type { EditorNoticeState } from "./homeStageEditorModel";

interface HomeStageEditorNoticeProps {
  notice: EditorNoticeState;
  onExitEditor: () => void;
  onOpenAdvancedSettings: () => void;
}

export function HomeStageEditorNotice({
  notice,
  onExitEditor,
  onOpenAdvancedSettings,
}: HomeStageEditorNoticeProps) {
  return (
    <section className={`home-stage-editor__notice is-${notice.tone}`}>
      <div>
        <strong>{notice.title}</strong>
        <p>{notice.detail}</p>
      </div>
      <div className="badge-row">
        <button
          className="button button--ghost"
          onClick={() => void onOpenAdvancedSettings()}
          type="button"
        >
          更多首页高级设置
        </button>
        <button
          className="button button--ghost"
          onClick={() => void onExitEditor()}
          type="button"
        >
          退出编辑
        </button>
      </div>
    </section>
  );
}
