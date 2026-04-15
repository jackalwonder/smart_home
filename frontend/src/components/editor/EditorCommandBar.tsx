interface EditorCommandBarProps {
  rows: Array<{ label: string; value: string }>;
  modeLabel: string;
  helperText: string;
  canSave: boolean;
  canPublish: boolean;
  saveBusy: boolean;
  publishBusy: boolean;
  hotspotCount: number;
  onAddHotspot: () => void;
  onSaveDraft: () => void;
  onPublishDraft: () => void;
}

export function EditorCommandBar({
  rows,
  modeLabel,
  helperText,
  canSave,
  canPublish,
  saveBusy,
  publishBusy,
  hotspotCount,
  onAddHotspot,
  onSaveDraft,
  onPublishDraft,
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
        <button className="button button--ghost" onClick={onAddHotspot} type="button">
          新增热点
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
