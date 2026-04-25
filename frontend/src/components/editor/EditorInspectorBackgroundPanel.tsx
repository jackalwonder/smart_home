interface EditorInspectorBackgroundPanelProps {
  backgroundAssetId: string | null;
  backgroundImageUrl: string | null;
  canEdit: boolean;
  isUploadingBackground: boolean;
  layoutMetaText: string;
  onChangeLayoutMeta: (value: string) => void;
  onClearBackground: () => void;
  onUploadBackground: (file: File) => void;
}

export function EditorInspectorBackgroundPanel({
  backgroundAssetId,
  backgroundImageUrl,
  canEdit,
  isUploadingBackground,
  layoutMetaText,
  onChangeLayoutMeta,
  onClearBackground,
  onUploadBackground,
}: EditorInspectorBackgroundPanelProps) {
  return (
    <div className="editor-inspector__meta">
      <label className="form-field form-field--full">
        <span>上传背景图</span>
        <input
          accept="image/*"
          className="control-input"
          disabled={!canEdit || isUploadingBackground}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              onUploadBackground(file);
            }
            event.currentTarget.value = "";
          }}
          type="file"
        />
      </label>
      <div className="settings-module-card__actions form-field--full">
        <button
          className="button button--ghost button--danger"
          disabled={!canEdit || !backgroundAssetId}
          onClick={onClearBackground}
          type="button"
        >
          清除背景图
        </button>
      </div>
      <label className="form-field">
        <span>背景资产 ID</span>
        <input className="control-input" readOnly value={backgroundAssetId ?? "-"} />
      </label>
      <label className="form-field">
        <span>预览地址</span>
        <input className="control-input" readOnly value={backgroundImageUrl ?? "-"} />
      </label>
      <label className="form-field form-field--full">
        <span>布局元数据（JSON）</span>
        <textarea
          className="control-input control-input--textarea"
          disabled={!canEdit}
          onChange={(event) => onChangeLayoutMeta(event.target.value)}
          rows={8}
          value={layoutMetaText}
        />
      </label>
    </div>
  );
}
