import { HomeViewModel } from "../../view-models/home";
import {
  compactDateLabel,
  parseNumber,
  parsePercent,
  weatherGlyph,
} from "./homeInsightRailModel";

export function HomeRailWeatherBrief({ viewModel }: { viewModel: HomeViewModel }) {
  const humidityValue = parsePercent(viewModel.timeline.humidity);
  const precipitationValue = parseNumber(viewModel.timeline.precipitation);
  const weatherDate = compactDateLabel(viewModel.timeline.date);
  const condition = viewModel.timeline.weatherCondition;
  const weatherLocation = viewModel.timeline.weatherLocation || "本地天气";

  return (
    <section className="home-weather-brief" aria-label="天气简略情况">
      <div className="home-weather-brief__summary">
        <div className="home-weather-brief__reading">
          <span className="home-weather-brief__icon" aria-hidden="true">
            {weatherGlyph(condition)}
          </span>
          <div>
            <strong>{viewModel.timeline.weatherTemperature.replace(" °C", "°")}</strong>
            <small>{condition}</small>
          </div>
        </div>
        <div className="home-weather-brief__place">
          <span>{weatherLocation}</span>
          <b>{weatherDate}</b>
        </div>
      </div>

      <div className="home-weather-brief__meters">
        <Meter
          label="空气湿度"
          tone="blue"
          value={`${humidityValue}%`}
          width={humidityValue}
        />
        <Meter
          label="降雨量"
          tone="cyan"
          value={viewModel.timeline.precipitation}
          width={Math.min(100, precipitationValue * 12)}
        />
      </div>
    </section>
  );
}

function Meter({
  label,
  tone,
  value,
  width,
}: {
  label: string;
  tone: "blue" | "cyan";
  value: string;
  width: number;
}) {
  return (
    <div className="home-weather-brief__meter">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <i>
        <b className={`is-${tone}`} style={{ width: `${Math.max(3, width)}%` }} />
      </i>
    </div>
  );
}
