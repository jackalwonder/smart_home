import { HomeMetricViewModel } from "../../view-models/home";

interface BottomStatsStripProps {
  stats: HomeMetricViewModel[];
  events: Array<{ title: string; subtitle: string }>;
  connectionStatus: string;
}

export function BottomStatsStrip({ stats, events, connectionStatus }: BottomStatsStripProps) {
  const normalizedStatus = connectionStatus.toLowerCase();
  const connectionTone =
    normalizedStatus === "connected"
      ? "is-online"
      : normalizedStatus === "connecting"
        ? "is-warming"
        : "is-offline";
  const connectionLabel =
    normalizedStatus === "connected"
      ? "已连接"
      : normalizedStatus === "connecting"
        ? "连接中"
        : "未连接";

  return (
    <div className="bottom-stats-area">
      <section className="bottom-stats-strip">
        {stats.map((stat) => (
          <article key={stat.label} className="bottom-stats-strip__item">
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </article>
        ))}
      </section>
      <section className="bottom-event-strip">
        <div className="bottom-event-strip__header">
          <span className="card-eyebrow">实时流</span>
          <strong className={`bottom-event-strip__status ${connectionTone}`}>{connectionLabel}</strong>
        </div>
        <div className="bottom-event-strip__list">
          {events.length ? (
            events.map((event, index) => (
              <article key={`${event.title}-${index}`} className="bottom-event-strip__item">
                <strong>{event.title}</strong>
                <span>{event.subtitle}</span>
              </article>
            ))
          ) : (
            <p className="muted-copy">当前还没有收到实时事件，后续到达后会在这里滚动显示。</p>
          )}
        </div>
      </section>
    </div>
  );
}
