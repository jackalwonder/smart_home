import { useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { HomeViewModel } from "../../view-models/home";
import {
  HomeMediaSource,
  compactDateLabel,
  nextIndex,
  parseNumber,
  parsePercent,
  weatherGlyph,
} from "./homeInsightRailModel";

export interface RailSlide {
  key: string;
  label: string;
  content: ReactNode;
}

export function RailCarousel({
  activeIndex,
  ariaLabel,
  onChange,
  slides,
  variant,
}: {
  activeIndex: number;
  ariaLabel: string;
  onChange: (index: number) => void;
  slides: RailSlide[];
  variant: "feature" | "media";
}) {
  const [dragStart, setDragStart] = useState<number | null>(null);

  function commitSwipe(clientX: number) {
    if (dragStart === null) {
      return;
    }
    const delta = clientX - dragStart;
    setDragStart(null);
    if (Math.abs(delta) < 42) {
      return;
    }
    onChange(nextIndex(activeIndex, slides.length, delta < 0 ? 1 : -1));
  }

  return (
    <section className={`home-rail-carousel home-rail-carousel--${variant}`} aria-label={ariaLabel}>
      <div
        className="home-rail-carousel__viewport"
        onPointerCancel={() => setDragStart(null)}
        onPointerDown={(event) => setDragStart(event.clientX)}
        onPointerLeave={(event) => commitSwipe(event.clientX)}
        onPointerUp={(event) => commitSwipe(event.clientX)}
      >
        <div
          className="home-rail-carousel__track"
          style={{ transform: `translateX(-${activeIndex * 100}%)` }}
        >
          {slides.map((slide) => (
            <div key={slide.key} className="home-rail-carousel__slide" aria-label={slide.label}>
              {slide.content}
            </div>
          ))}
        </div>
      </div>
      <div className="home-rail-carousel__dots">
        {slides.map((slide, index) => (
          <button
            key={slide.key}
            aria-label={slide.label}
            className={index === activeIndex ? "is-active" : ""}
            onClick={() => onChange(index)}
            type="button"
          />
        ))}
      </div>
    </section>
  );
}

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
        <Meter label="空气湿度" tone="blue" value={`${humidityValue}%`} width={humidityValue} />
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

export function NoticeControlsSlide() {
  const [calendarOn, setCalendarOn] = useState(false);
  const [noticeOn, setNoticeOn] = useState(true);

  return (
    <article className="home-notice-slide">
      <header className="home-status-panel__header">
        <div>
          <span className="card-eyebrow">通知开关</span>
          <strong>快捷状态</strong>
        </div>
        <em>本地</em>
      </header>

      <div className="home-notice-slide__controls">
        <ToggleRow
          active={calendarOn}
          detail="CALENDAR_FULL_SWITCH"
          label="日程音响开关"
          onToggle={() => setCalendarOn((current) => !current)}
        />
        <ToggleRow
          active={noticeOn}
          detail="PUSH_AUDIO_CHILDREN_SWITCH"
          label="推送通知"
          onToggle={() => setNoticeOn((current) => !current)}
        />
      </div>
    </article>
  );
}

export function FavoriteDevicesSlide({
  viewModel,
  onOpenFavoriteDevice,
}: {
  viewModel: HomeViewModel;
  onOpenFavoriteDevice: (deviceId: string) => void;
}) {
  return (
    <section
      aria-label="首页常用设备"
      className="home-trends-slide home-favorite-rail-slide"
    >
      <header className="home-status-panel__header">
        <div>
          <span className="card-eyebrow">首页入口</span>
          <strong>常用设备</strong>
        </div>
        <em>{viewModel.favoriteDevices.length ? "就绪" : "空"}</em>
      </header>

      {viewModel.favoriteDevices.length ? (
        <div className="home-favorite-device-list">
          {viewModel.favoriteDevices.slice(0, 3).map((device) => (
            <button
              key={device.deviceId}
              className={[
                "home-favorite-device-row",
                device.tone === "warm"
                  ? "is-warm"
                  : device.tone === "neutral"
                    ? "is-neutral"
                    : "is-accent",
                device.isOffline ? "is-offline" : "",
              ].join(" ")}
              onClick={() => onOpenFavoriteDevice(device.deviceId)}
              type="button"
            >
              <b>{device.iconGlyph}</b>
              <span>
                <strong>{device.label}</strong>
                <small>
                  {device.roomName} · {device.deviceTypeLabel}
                </small>
              </span>
              <em>{device.statusSummary ?? device.statusLabel}</em>
            </button>
          ))}
        </div>
      ) : (
        <div className="quick-scene-card__empty">
          <strong>暂无常用设备</strong>
          <p>从设备页添加后会显示在这里。</p>
          <Link className="button button--ghost" to="/devices">
            添加设备
          </Link>
        </div>
      )}
    </section>
  );
}

function ToggleRow({
  active,
  detail,
  label,
  onToggle,
}: {
  active: boolean;
  detail: string;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button className="home-toggle-row" onClick={onToggle} type="button">
      <span aria-hidden="true">🔔</span>
      <div>
        <strong>{label}</strong>
        <small>{detail}</small>
      </div>
      <i className={active ? "is-active" : ""} />
    </button>
  );
}

export function HomeMediaPlayerSlide({
  source,
}: {
  source: HomeMediaSource;
}) {
  return (
    <article className="home-media-player">
      <div className="home-media-player__cover">
        <span>{source.glyph}</span>
      </div>
      <div className="home-media-player__copy">
        <span>{source.source}</span>
        <strong>{source.title}</strong>
        <small>{source.subtitle}</small>
      </div>
      {source.isPlaceholder ? (
        <Link className="home-media-player__settings-link" to="/settings?section=integrations">
          配置媒体
        </Link>
      ) : (
        <div className="home-media-player__controls">
          <button aria-label="上一源" type="button">
            ‹
          </button>
          <button
            aria-label={source.state === "播放中" ? "暂停" : "播放"}
            className="is-primary"
            type="button"
          >
            {source.state === "播放中" ? "Ⅱ" : "▶"}
          </button>
          <button aria-label="下一源" type="button">
            ›
          </button>
        </div>
      )}
    </article>
  );
}
