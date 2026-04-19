import { HomeMetricViewModel } from "../../view-models/home";

interface DeviceSummaryCardProps {
  metrics: HomeMetricViewModel[];
}

export function DeviceSummaryCard({ metrics }: DeviceSummaryCardProps) {
  const onlineMetric = metrics.find((metric) => metric.label === "在线");
  const offlineMetric = metrics.find((metric) => metric.label === "离线");
  const runningMetric = metrics.find((metric) => metric.label === "运行中");
  const lowBatteryMetric = metrics.find((metric) => metric.label === "低电量");
  const onlineCount = Number(onlineMetric?.value ?? 0);
  const offlineCount = Number(offlineMetric?.value ?? 0);
  const runningCount = Number(runningMetric?.value ?? 0);
  const lowBatteryCount = Number(lowBatteryMetric?.value ?? 0);
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
    <section className="utility-card home-health-card">
      <span className="card-eyebrow">家庭状态</span>
      <div className="home-health-card__hero">
        <div>
          <h3>{offlineCount ? "有设备需要关注" : "家里运行平稳"}</h3>
          <p className="muted-copy">
            {offlineCount
              ? `${offlineCount} 个设备离线，建议先检查网络或电源。`
              : "在线设备状态正常，常用控制可以直接使用。"}
          </p>
        </div>
        <strong>{onlineRate}</strong>
      </div>
      <div className="home-health-card__chips">
        <span className="state-chip is-online">在线 {onlineCount}</span>
        <span className={offlineCount ? "state-chip is-offline" : "state-chip"}>
          离线 {offlineCount}
        </span>
        <span className={runningCount ? "state-chip is-warming" : "state-chip"}>
          运行中 {runningCount}
        </span>
        <span
          className={lowBatteryCount ? "state-chip is-offline" : "state-chip"}
        >
          低电量 {lowBatteryCount}
        </span>
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
