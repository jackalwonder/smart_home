export type PolicyEntryDraftType = "string" | "number" | "boolean" | "json";

export interface PolicyEntryDraft {
  id: string;
  key: string;
  type: PolicyEntryDraftType;
  value: string;
}

interface StructuredPolicyEditorProps {
  title: string;
  description: string;
  entries: PolicyEntryDraft[];
  onAddEntry: () => void;
  onRemoveEntry: (index: number) => void;
  onChangeEntry: (index: number, field: "key" | "type" | "value", value: string) => void;
}

export function StructuredPolicyEditor({
  title,
  description,
  entries,
  onAddEntry,
  onRemoveEntry,
  onChangeEntry,
}: StructuredPolicyEditorProps) {
  return (
    <section className="policy-editor">
      <div className="policy-editor__header">
        <div>
          <h4>{title}</h4>
          <p className="muted-copy">{description}</p>
        </div>
        <button className="button button--ghost" onClick={onAddEntry} type="button">
          新增字段
        </button>
      </div>
      {entries.length ? (
        <div className="policy-editor__list">
          {entries.map((entry, index) => (
            <article key={entry.id} className="policy-editor__row">
              <label className="form-field">
                <span>键名</span>
                <input
                  className="control-input"
                  onChange={(event) => onChangeEntry(index, "key", event.target.value)}
                  placeholder="policy_key"
                  value={entry.key}
                />
              </label>
              <label className="form-field">
                <span>类型</span>
                <select
                  className="control-input"
                  onChange={(event) => onChangeEntry(index, "type", event.target.value)}
                  value={entry.type}
                >
                  <option value="string">文本</option>
                  <option value="number">数字</option>
                  <option value="boolean">布尔</option>
                  <option value="json">JSON</option>
                </select>
              </label>
              <label className="form-field policy-editor__value">
                <span>值</span>
                {entry.type === "boolean" ? (
                  <select
                    className="control-input"
                    onChange={(event) => onChangeEntry(index, "value", event.target.value)}
                    value={entry.value}
                  >
                    <option value="true">开启</option>
                    <option value="false">关闭</option>
                  </select>
                ) : entry.type === "json" ? (
                  <textarea
                    className="control-input control-input--textarea"
                    onChange={(event) => onChangeEntry(index, "value", event.target.value)}
                    rows={5}
                    value={entry.value}
                  />
                ) : (
                  <input
                    className="control-input"
                    onChange={(event) => onChangeEntry(index, "value", event.target.value)}
                    type={entry.type === "number" ? "number" : "text"}
                    value={entry.value}
                  />
                )}
              </label>
              <button
                className="button button--ghost button--danger"
                onClick={() => onRemoveEntry(index)}
                type="button"
              >
                删除
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="policy-editor__empty">
          <p className="muted-copy">当前没有扩展字段，如需补充特殊策略可以在这里新增。</p>
        </div>
      )}
    </section>
  );
}
