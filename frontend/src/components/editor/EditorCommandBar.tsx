interface EditorCommandBarProps {
  rows: Array<{ label: string; value: string }>;
  modeLabel: string;
  helperText: string;
  canSave: boolean;
  canPublish: boolean;
  canAcquire: boolean;
  canTakeover: boolean;
  canDiscard: boolean;
  acquireBusy: boolean;
  saveBusy: boolean;
  publishBusy: boolean;
  takeoverBusy: boolean;
  discardBusy: boolean;
  hotspotCount: number;
  onAddHotspot: () => void;
  onAcquire: () => void;
  onSaveDraft: () => void;
  onPublishDraft: () => void;
  onTakeover: () => void;
  onDiscardDraft: () => void;
}

export function EditorCommandBar({
  rows,
  modeLabel,
  helperText,
  canSave,
  canPublish,
  canAcquire,
  canTakeover,
  canDiscard,
  acquireBusy,
  saveBusy,
  publishBusy,
  takeoverBusy,
  discardBusy,
  hotspotCount,
  onAddHotspot,
  onAcquire,
  onSaveDraft,
  onPublishDraft,
  onTakeover,
  onDiscardDraft,
}: EditorCommandBarProps) {
  return (
    <header className="panel editor-command-bar">
      <div>
        <span className="card-eyebrow">工作台</span>
        <h2>户型编辑器</h2>
        <p className="muted-copy">{helperText}</p>
      </div>
      <div className="badge-row">
        <span className="state-chip">{modeLabel}</span>
        <span className="state-chip">{hotspotCount} 个热点</span>
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
          {publishBusy ? "发布中..." : "发布草稿"}
        </button>
      </div>
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
