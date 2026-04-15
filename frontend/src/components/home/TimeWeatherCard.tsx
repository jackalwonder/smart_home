interface TimeWeatherCardProps {
  time: string;
  date: string;
  weatherTemperature: string;
  weatherCondition: string;
  humidity: string;
}

export function TimeWeatherCard({
  time,
  date,
  weatherTemperature,
  weatherCondition,
  humidity,
}: TimeWeatherCardProps) {
  const humidityValue = Math.min(Number(humidity) || 0, 100);
  const comfortValue = Math.max(18, Math.min(Number(weatherTemperature) || 26, 32));
  const comfortWidth = `${((comfortValue - 18) / 14) * 100}%`;

  return (
    <section className="utility-card utility-card--ambient">
      <span className="card-eyebrow">环境</span>
      <div className="time-weather-card__headline">
        <strong>{time}</strong>
        <span>{date}</span>
      </div>
      <div className="badge-row">
        <span className="state-chip">天气 {weatherCondition}</span>
        <span className="state-chip">温度 {weatherTemperature}</span>
      </div>
      <div className="metric-stack">
        <div className="metric-stack__item">
          <span>天气</span>
          <strong>{weatherCondition}</strong>
        </div>
        <div className="metric-stack__item">
          <span>温度</span>
          <strong>{weatherTemperature}</strong>
        </div>
        <div className="metric-stack__item">
          <span>湿度</span>
          <strong>{humidity}</strong>
        </div>
      </div>
      <div className="ambient-bars">
        <div className="ambient-bars__row">
          <span>湿度曲线</span>
          <div className="ambient-bars__track">
            <div className="ambient-bars__fill" style={{ width: `${humidityValue}%` }} />
          </div>
        </div>
        <div className="ambient-bars__row">
          <span>舒适指数</span>
          <div className="ambient-bars__track">
            <div className="ambient-bars__fill is-warm" style={{ width: comfortWidth }} />
          </div>
        </div>
      </div>
    </section>
  );
}
