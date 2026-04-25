interface TimeWeatherCardProps {
  time: string;
  date: string;
  weatherTemperature: string;
  weatherCondition: string;
  humidity: string;
}

function clampPercent(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(value, max));
}

export function TimeWeatherCard({
  time,
  date,
  weatherTemperature,
  weatherCondition,
  humidity,
}: TimeWeatherCardProps) {
  const humidityValue = clampPercent(Number(humidity) || 0);
  const temperatureValue = Number.parseFloat(weatherTemperature) || 24;
  const comfortWidth = `${clampPercent(((temperatureValue - 16) / 16) * 100)}%`;

  return (
    <section className="utility-card utility-card--ambient time-weather-card">
      <div className="time-weather-card__topline">
        <span className="card-eyebrow">环境总览</span>
        <span className="time-weather-card__location">HOME</span>
      </div>
      <div className="time-weather-card__headline">
        <strong>{time}</strong>
        <span>{date}</span>
      </div>
      <div className="time-weather-card__weather-hero">
        <div>
          <p className="time-weather-card__temperature">{weatherTemperature}</p>
          <p className="time-weather-card__condition">{weatherCondition}</p>
        </div>
        <div className="time-weather-card__meta">
          <span>室内环境</span>
          <strong>Shadow Home</strong>
        </div>
      </div>
      <div className="time-weather-card__bars">
        <div className="ambient-bars__row">
          <div className="time-weather-card__bar-label">
            <span>空气湿度</span>
            <strong>{humidity}</strong>
          </div>
          <div className="ambient-bars__track">
            <div className="ambient-bars__fill" style={{ width: `${humidityValue}%` }} />
          </div>
        </div>
        <div className="ambient-bars__row">
          <div className="time-weather-card__bar-label">
            <span>体感舒适</span>
            <strong>{Math.round(clampPercent(Number(comfortWidth.replace("%", ""))))}%</strong>
          </div>
          <div className="ambient-bars__track">
            <div className="ambient-bars__fill is-warm" style={{ width: comfortWidth }} />
          </div>
        </div>
      </div>
    </section>
  );
}
