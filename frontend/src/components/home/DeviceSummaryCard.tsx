import { HomeMetricViewModel } from "../../view-models/home";

interface DeviceSummaryCardProps {
  metrics: HomeMetricViewModel[];
}

export function DeviceSummaryCard({ metrics }: DeviceSummaryCardProps) {
  const onlineMetric = metrics.find((metric) => metric.label === "在线");
  const offlineMetric = metrics.find((metric) => metric.label === "离线");
  const onlineCount = Number(onlineMetric?.value ?? 0);
  const offlineCount = Number(offlineMetric?.value ?? 0);
  const onlineRate =
    onlineCount + offlineCount > 0
      ? `${Math.round((onlineCount / (onlineCount + offlineCount)) * 100)}%`
      : "0%";

  return (
    <section className="utility-card home-health-card">
      <div className="home-health-card__header">
        <span className="card-eyebrow">设备状态</span>
        <span className="state-chip is-online">{onlineRate} 在线率</span>
      </div>
      <div className="home-health-card__hero">
        <div>
          <h3>{offlineCount ? "需要关注" : "运行平稳"}</h3>
          <p className="muted-copy">
            {offlineCount
              ? `${offlineCount} 个设备当前离线，建议优先检查连接或供电。`
              : "当前主要设备在线，常用控制可以直接进入。"}
          </p>
        </div>
        <strong>{onlineRate}</strong>
      </div>
      <div className="home-health-card__summary-grid">
        {metrics.map((metric) => (
          <article key={metric.label} className="home-health-card__summary-item">
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}
