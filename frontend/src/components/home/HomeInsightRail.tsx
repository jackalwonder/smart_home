import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { DeviceListItemDto } from "../../api/types";
import { HomeViewModel } from "../../view-models/home";

type HomeClusterKey = "lights" | "climate" | "battery" | "offline";

interface HomeInsightRailProps {
  viewModel: HomeViewModel;
  devices: DeviceListItemDto[];
  onOpenFavoriteDevice: (deviceId: string) => void;
  onOpenCluster: (key: HomeClusterKey) => void;
}

interface RailSlide {
  key: string;
  label: string;
  content: ReactNode;
}

interface HomeMediaSource {
  key: string;
  source: string;
  title: string;
  subtitle: string;
  state: string;
  glyph: string;
}

function normalizeKeyword(value: string | null | undefined) {
  return (value ?? "").toLowerCase();
}

function isLightDevice(device: DeviceListItemDto) {
  const source = normalizeKeyword(device.device_type);
  return source.includes("light") || source.includes("lamp") || source.includes("switch");
}

function isClimateDevice(device: DeviceListItemDto) {
  const source = normalizeKeyword(device.device_type);
  return source.includes("climate") || source.includes("air") || source.includes("fridge");
}

function isMediaDevice(device: DeviceListItemDto) {
  const source = normalizeKeyword(device.device_type);
  return source.includes("media") || source.includes("speaker") || source.includes("tv");
}

function parsePercent(value: string) {
  const parsed = Number.parseFloat(value.replace("%", ""));
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.min(100, parsed));
}

function parseNumber(value: string, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function weatherGlyph(condition: string) {
  const normalized = normalizeKeyword(condition);
  if (normalized.includes("雨") || normalized.includes("rain")) {
    return "☔";
  }
  if (normalized.includes("云") || normalized.includes("cloud")) {
    return "☁";
  }
  if (normalized.includes("雪") || normalized.includes("snow")) {
    return "❄";
  }
  if (normalized.includes("雷")) {
    return "⚡";
  }
  if (normalized.includes("雾")) {
    return "〰";
  }
  return "☀";
}

function shortDateLabel(dateLabel: string) {
  const match = dateLabel.match(/(\d+)月(\d+)日/);
  if (!match) {
    return dateLabel;
  }
  const weekday = dateLabel.match(/星期[一二三四五六日天]/)?.[0];
  return `${weekday ? `${weekday} ` : ""}${match[1]}月${match[2]}日`;
}

function compactDateLabel(dateLabel: string) {
  const match = dateLabel.match(/(\d+)月(\d+)日/);
  if (!match) {
    return dateLabel;
  }
  return `${match[1]}月${match[2]}日`;
}

function nextIndex(current: number, length: number, direction: -1 | 1) {
  if (length <= 1) {
    return current;
  }
  return (current + direction + length) % length;
}

function RailCarousel({
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

function HomeRailWeatherBrief({ viewModel }: { viewModel: HomeViewModel }) {
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

function WeatherTrendsSlide({ viewModel }: { viewModel: HomeViewModel }) {
  return (
    <article className="home-trends-slide">
      <header className="home-status-panel__header">
        <div>
          <span className="card-eyebrow">气象站 / TRENDS</span>
          <strong>6-Day Forecast</strong>
        </div>
        <em>{viewModel.timeline.weatherLocation || "LOCAL"}</em>
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

function NoticeControlsSlide() {
  const [calendarOn, setCalendarOn] = useState(false);
  const [noticeOn, setNoticeOn] = useState(true);

  return (
    <article className="home-notice-slide">
      <header className="home-status-panel__header">
        <div>
          <span className="card-eyebrow">通知 + 功能键</span>
          <strong>快捷状态</strong>
        </div>
        <em>v2.0 STABLE</em>
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

function FavoriteDevicesSlide({
  viewModel,
  onOpenFavoriteDevice,
}: Pick<HomeInsightRailProps, "viewModel" | "onOpenFavoriteDevice">) {
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
        <em>{viewModel.favoriteDevices.length ? "READY" : "EMPTY"}</em>
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
          <strong>还没有首页常用设备</strong>
          <p>从设备页加入首页后，这里会变成现场最快入口。</p>
          <Link className="button button--ghost" to="/devices">
            去设备页添加
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

function HomeMediaPlayerSlide({
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
    </article>
  );
}

export function HomeInsightRail({
  viewModel,
  devices,
  onOpenCluster,
  onOpenFavoriteDevice,
}: HomeInsightRailProps) {
  const [featureIndex, setFeatureIndex] = useState(0);
  const [mediaIndex, setMediaIndex] = useState(0);

  const lightsCount =
    devices.filter((device) => !device.is_offline && isLightDevice(device)).length ||
    viewModel.summary.lightsOnCount;
  const climateCount = devices.filter((device) => isClimateDevice(device)).length;
  const batteryCount = viewModel.summary.lowBatteryCount;
  const offlineCount =
    devices.filter((device) => device.is_offline).length || viewModel.summary.offlineCount;

  const mediaSources = useMemo(() => {
    const sources: HomeMediaSource[] = [];

    if (viewModel.media.deviceId || viewModel.media.bindingStatus !== "未配置") {
      sources.push({
        key: viewModel.media.deviceId ?? "default-media",
        source: viewModel.media.displayName,
        title: viewModel.media.trackTitle,
        subtitle: viewModel.media.artist,
        state: viewModel.media.playState,
        glyph: "♪",
      });
    }

    devices.filter(isMediaDevice).forEach((device, index) => {
      if (device.device_id === viewModel.media.deviceId) {
        return;
      }

      sources.push({
        key: device.device_id,
        source: device.display_name,
        title: device.room_name ? `${device.room_name} 播放设备` : "媒体播放设备",
        subtitle: device.is_offline ? "离线" : "可用",
        state: device.status,
        glyph: index % 2 === 0 ? "▶" : "H",
      });
    });

    if (!sources.length) {
      sources.push({
        key: "empty-media",
        source: "HA 未发现媒体源",
        title: "暂无播放设备",
        subtitle: "接入 media_player 后会展示真实播放状态",
        state: "待机",
        glyph: "♪",
      });
    }

    return sources;
  }, [devices, viewModel.media]);

  const featureSlides = useMemo<RailSlide[]>(
    () => [
      {
        key: "weather",
        label: "气象脉动",
        content: <WeatherTrendsSlide viewModel={viewModel} />,
      },
      ...(viewModel.showFavoriteDevices
        ? [
            {
              key: "favorites",
              label: "首页常用设备",
              content: (
                <FavoriteDevicesSlide
                  onOpenFavoriteDevice={onOpenFavoriteDevice}
                  viewModel={viewModel}
                />
              ),
            },
          ]
        : []),
      {
        key: "notice",
        label: "通知功能键",
        content: <NoticeControlsSlide />,
      },
    ],
    [onOpenFavoriteDevice, viewModel],
  );

  const mediaSlides = useMemo<RailSlide[]>(
    () =>
      mediaSources.map((source) => ({
        key: source.key,
        label: source.source,
        content: <HomeMediaPlayerSlide source={source} />,
      })),
    [mediaSources],
  );

  return (
    <aside className="home-insight-rail home-status-rail">
      <HomeRailWeatherBrief viewModel={viewModel} />
      <RailCarousel
        activeIndex={featureIndex}
        ariaLabel="右侧功能轮播"
        onChange={setFeatureIndex}
        slides={featureSlides}
        variant="feature"
      />
      <RailCarousel
        activeIndex={mediaIndex}
        ariaLabel="右侧音频轮播"
        onChange={setMediaIndex}
        slides={mediaSlides}
        variant="media"
      />
      <section className="home-quick-grid" aria-label="全屋快捷入口">
        <button className="is-active" onClick={() => onOpenCluster("lights")} type="button">
          <span aria-hidden="true">♢</span>
          <strong>灯光</strong>
          <small>{lightsCount}</small>
        </button>
        <button onClick={() => onOpenCluster("climate")} type="button">
          <span aria-hidden="true">✣</span>
          <strong>温控</strong>
          <small>{climateCount}</small>
        </button>
        <button onClick={() => onOpenCluster("battery")} type="button">
          <span aria-hidden="true">▣</span>
          <strong>低电量</strong>
          <small>{batteryCount}</small>
        </button>
        <button onClick={() => onOpenCluster("offline")} type="button">
          <span aria-hidden="true">ⓘ</span>
          <strong>离线</strong>
          <small>{offlineCount}</small>
        </button>
      </section>
    </aside>
  );
}
