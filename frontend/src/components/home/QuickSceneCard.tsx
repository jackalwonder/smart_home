import { HomeQuickActionViewModel } from "../../view-models/home";

interface QuickSceneCardProps {
  actions: HomeQuickActionViewModel[];
}

export function QuickSceneCard({ actions }: QuickSceneCardProps) {
  return (
    <section className="utility-card">
      <span className="card-eyebrow">快捷场景</span>
      <h3>快速入口</h3>
      <div className="quick-scene-grid">
        {actions.length ? (
          actions.map((action) => (
            <article key={action.key} className="quick-scene-grid__item">
              <span>{action.title}</span>
              <strong>{action.badgeCount}</strong>
              <small>点按打开</small>
            </article>
          ))
        ) : (
          <p className="muted-copy">后端写入快捷入口后，这里会自动显示。</p>
        )}
      </div>
    </section>
  );
}
