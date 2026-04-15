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
  const maxValue = Math.max(
    1,
    ...metrics.map((metric) => {
      const parsed = Number(metric.value);
      return Number.isFinite(parsed) ? parsed : 0;
    }),
  );

  return (
    <section className="utility-card">
      <span className="card-eyebrow">状态矩阵</span>
      <h3>设备总览</h3>
      <div className="badge-row">
        <span className="state-chip">在线率 {onlineRate}</span>
        <span className="state-chip">设备池 {onlineCount + offlineCount}</span>
      </div>
      <div className="summary-grid">
        {metrics.map((metric) => (
          <article key={metric.label} className="summary-grid__item">
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <div className="summary-grid__meter">
              <div
                className="summary-grid__meter-fill"
                style={{
                  width: `${(Math.max(Number(metric.value) || 0, 0) / maxValue) * 100}%`,
                }}
              />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
