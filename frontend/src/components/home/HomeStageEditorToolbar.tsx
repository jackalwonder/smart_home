interface HomeStageEditorToolbarProps {
  canEdit: boolean;
  hasUnsavedChanges: boolean;
  historyState: {
    undoCount: number;
    redoCount: number;
  };
  isApplying: boolean;
  isLoading: boolean;
  isSaving: boolean;
  onAddHotspot: () => void;
  onApplyChanges: () => void;
  onExitEditor: () => void;
  onOpenAdvancedSettings: () => void;
  onRedoChange: () => void;
  onUndoChange: () => void;
}

export function HomeStageEditorToolbar({
  canEdit,
  hasUnsavedChanges,
  historyState,
  isApplying,
  isLoading,
  isSaving,
  onAddHotspot,
  onApplyChanges,
  onExitEditor,
  onOpenAdvancedSettings,
  onRedoChange,
  onUndoChange,
}: HomeStageEditorToolbarProps) {
  return (
    <header className="panel home-stage-editor__toolbar">
      <div>
        <span className="card-eyebrow">总览轻编辑</span>
        <h2>编辑首页</h2>
        <p className="muted-copy">
          在这里直接改舞台上的热点位置和基础视觉属性；复杂资源、批量编排和草稿发布治理继续留在设置页。
        </p>
      </div>
      <div className="badge-row">
        <span className="state-chip">
          {canEdit ? "编辑锁已授予" : "请前往高级设置处理锁状态"}
        </span>
        <span className="state-chip">{hasUnsavedChanges ? "有未应用更改" : "当前已同步"}</span>
        <button
          className="button button--ghost"
          disabled={!canEdit}
          onClick={onAddHotspot}
          type="button"
        >
          新增热点
        </button>
        <button
          className="button button--ghost"
          disabled={!canEdit || historyState.undoCount === 0}
          onClick={onUndoChange}
          type="button"
        >
          撤销
        </button>
        <button
          className="button button--ghost"
          disabled={!canEdit || historyState.redoCount === 0}
          onClick={onRedoChange}
          type="button"
        >
          重做
        </button>
        <button
          className="button button--ghost"
          disabled={isSaving || isApplying}
          onClick={() => void onOpenAdvancedSettings()}
          type="button"
        >
          更多首页高级设置
        </button>
        <button
          className="button button--ghost"
          disabled={isSaving || isApplying}
          onClick={() => void onExitEditor()}
          type="button"
        >
          退出编辑
        </button>
        <button
          className="button button--primary"
          disabled={!canEdit || isApplying || isLoading}
          onClick={() => void onApplyChanges()}
          type="button"
        >
          {isApplying ? "应用中..." : "应用首页更改"}
        </button>
      </div>
    </header>
  );
}
