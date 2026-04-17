export interface EditorPublishSummaryItem {
  label: string;
  value: string;
}

interface EditorPublishSummaryProps {
  items: EditorPublishSummaryItem[];
  totalChanges: number;
}

export function EditorPublishSummary({ items, totalChanges }: EditorPublishSummaryProps) {
  return (
    <section className="panel editor-publish-summary" aria-label="发布前变更摘要">
      <div>
        <span className="card-eyebrow">发布前变更摘要</span>
        <h3>{totalChanges ? `${totalChanges} 项待发布变更` : "暂无待发布变更"}</h3>
        <p className="muted-copy">
          {totalChanges
            ? "发布前请确认以下草稿变化。"
            : "当前草稿与本次编辑开始时的内容一致。"}
        </p>
      </div>
      {items.length ? (
        <dl className="editor-publish-summary__list">
          {items.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}
