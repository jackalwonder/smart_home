import { HomeViewModel } from "../../view-models/home";

export function WeatherTrendsSlide({ viewModel }: { viewModel: HomeViewModel }) {
  return (
    <article className="home-trends-slide">
      <header className="home-status-panel__header">
        <div>
          <span className="card-eyebrow">气象趋势</span>
          <strong>6 日预报</strong>
        </div>
        <em>{viewModel.timeline.weatherLocation || "本地"}</em>
      </header>
      <div className="home-trends-slide__list">
        {viewModel.weatherTrend.map((point) => (
          <div
            key={point.key}
            className={
              point.emphasis ? "home-trends-slide__row is-active" : "home-trends-slide__row"
            }
          >
            <span>{point.label}</span>
            <b>{point.icon}</b>
            <strong>{point.high}</strong>
            <small>{point.low}</small>
          </div>
        ))}
      </div>
    </article>
  );
}
