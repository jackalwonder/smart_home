import { HomeQuickActionViewModel } from "../../view-models/home";

interface QuickSceneCardProps {
  actions: HomeQuickActionViewModel[];
}

function actionGlyph(title: string) {
  if (title.includes("收藏")) {
    return "常";
  }
  if (title.includes("场景")) {
    return "景";
  }
  if (title.includes("媒体")) {
    return "媒";
  }
  if (title.includes("能耗")) {
    return "能";
  }
  return "启";
}

export function QuickSceneCard({ actions }: QuickSceneCardProps) {
  return (
    <section className="utility-card quick-scene-card">
      <div className="quick-scene-card__header">
        <div>
          <span className="card-eyebrow">快捷入口</span>
          <h3>常用动作</h3>
        </div>
        <span className="state-chip">
          {actions.length ? `${actions.length} 个入口` : "待配置"}
        </span>
      </div>
      <div className="quick-scene-grid">
        {actions.length ? (
          actions.map((action) => (
            <article key={action.key} className="quick-scene-grid__item">
              <b>{actionGlyph(action.title)}</b>
              <span>{action.title}</span>
              <strong>{action.badgeCount}</strong>
              <small>触摸进入</small>
            </article>
          ))
        ) : (
          <p className="muted-copy">
            在设置中启用收藏、场景、媒体或能耗入口后，这里会自动显示。
          </p>
        )}
      </div>
    </section>
  );
}
