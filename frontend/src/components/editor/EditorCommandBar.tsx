interface EditorCommandBarProps {
  rows: Array<{ label: string; value: string }>;
  modeLabel: string;
  helperText: string;
  canSave: boolean;
  canPublish: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canAcquire: boolean;
  canTakeover: boolean;
  canDiscard: boolean;
  acquireBusy: boolean;
  saveBusy: boolean;
  publishBusy: boolean;
  takeoverBusy: boolean;
  discardBusy: boolean;
  hotspotCount: number;
  historyLabel: string | null;
  onAddHotspot: () => void;
  onAcquire: () => void;
  onSaveDraft: () => void;
  onPublishDraft: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onTakeover: () => void;
  onDiscardDraft: () => void;
}

export function EditorCommandBar({
  rows,
  modeLabel,
  helperText,
  canSave,
  canPublish,
  canUndo,
  canRedo,
  canAcquire,
  canTakeover,
  canDiscard,
  acquireBusy,
  saveBusy,
  publishBusy,
  takeoverBusy,
  discardBusy,
  hotspotCount,
  historyLabel,
  onAddHotspot,
  onAcquire,
  onSaveDraft,
  onPublishDraft,
  onUndo,
  onRedo,
  onTakeover,
  onDiscardDraft,
}: EditorCommandBarProps) {
  return (
    <header className="panel editor-command-bar">
      <div>
        <span className="card-eyebrow">工作台</span>
        <h2>户型编辑器</h2>
        <p className="muted-copy">{helperText}</p>
        <p className="muted-copy">
          背景图和热点先保存到草稿，点“发布到首页”后才会在总览显示。
        </p>
      </div>
      <div className="badge-row">
        <span className="state-chip">{modeLabel}</span>
        <span className="state-chip">{hotspotCount} 个热点</span>
        <span className="state-chip">{historyLabel ? `最近：${historyLabel}` : "无本地历史"}</span>
        <button
          className="button button--ghost"
          disabled={!canSave}
          onClick={onAddHotspot}
          type="button"
        >
          新增热点
        </button>
        <button
          className="button button--ghost"
          disabled={!canAcquire || acquireBusy}
          onClick={onAcquire}
          type="button"
        >
          {acquireBusy ? "申请中..." : "申请编辑"}
        </button>
        <button
          className="button button--primary"
          disabled={!canSave || saveBusy}
          onClick={onSaveDraft}
          type="button"
        >
          {saveBusy ? "保存中..." : "保存草稿"}
        </button>
        <button
          className="button button--ghost"
          disabled={!canUndo}
          onClick={onUndo}
          type="button"
        >
          撤销
        </button>
        <button
          className="button button--ghost"
          disabled={!canRedo}
          onClick={onRedo}
          type="button"
        >
          重做
        </button>
        <button
          className="button button--ghost"
          disabled={!canTakeover || takeoverBusy}
          onClick={onTakeover}
          type="button"
        >
          {takeoverBusy ? "接管中..." : "接管编辑"}
        </button>
        <button
          className="button button--ghost button--danger"
          disabled={!canDiscard || discardBusy}
          onClick={onDiscardDraft}
          type="button"
        >
          {discardBusy ? "丢弃中..." : "丢弃草稿"}
        </button>
        <button
          className="button button--ghost"
          disabled={!canPublish || publishBusy}
          onClick={onPublishDraft}
          type="button"
        >
          {publishBusy ? "\u53d1\u5e03\u4e2d..." : "\u53d1\u5e03\u5230\u9996\u9875"}
        </button>
      </div>
      <p className="editor-command-bar__shortcuts">
        快捷键：⌘/Ctrl+S 保存，⌘/Ctrl+Enter 发布，⌘/Ctrl+Z 撤销，Shift+⌘/Ctrl+Z 或 Ctrl+Y 重做，方向键移动，Shift+方向键移动 5%。
      </p>
      <dl className="field-grid">
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}
