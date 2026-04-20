import { useMemo, useState } from "react";
import { DeviceListItemDto } from "../../api/types";
import { HomeViewModel } from "../../view-models/home";

type HomeClusterKey = "lights" | "climate" | "battery" | "offline";

interface HomeInsightRailProps {
  viewModel: HomeViewModel;
  devices: DeviceListItemDto[];
  onOpenFavoriteDevice: (deviceId: string) => void;
  onOpenCluster: (key: HomeClusterKey) => void;
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

export function HomeInsightRail({
  viewModel,
  devices,
  onOpenFavoriteDevice,
  onOpenCluster,
}: HomeInsightRailProps) {
  const [railCardIndex, setRailCardIndex] = useState(0);
  const [mediaIndex, setMediaIndex] = useState(0);

  const railCards = viewModel.railCards;
  const activeRailCard = railCards[railCardIndex] ?? railCards[0];

  const mediaSources = useMemo(
    () => [
      {
        key: "default",
        source: "家庭播放源",
        title: viewModel.media.trackTitle,
        subtitle: viewModel.media.artist,
        state: viewModel.media.playState,
      },
      {
        key: "room",
        source: "客厅输出",
        title: viewModel.media.displayName,
        subtitle: `连接 ${viewModel.media.bindingStatus}`,
        state: viewModel.media.availabilityStatus,
      },
      {
        key: "later",
        source: "后续扩展",
        title: "可继续接入电视 / 音箱 / 背景音乐",
        subtitle: "这个位置保留给更多播放源切换",
        state: "预留位",
      },
    ],
    [viewModel.media],
  );
  const activeMedia = mediaSources[mediaIndex] ?? mediaSources[0];

  const lightsCount =
    devices.filter((device) => !device.is_offline && isLightDevice(device)).length ||
    viewModel.summary.lightsOnCount;
  const climateCount = devices.filter((device) => isClimateDevice(device)).length;
  const batteryCount = viewModel.summary.lowBatteryCount;
  const offlineCount = devices.filter((device) => device.is_offline).length || viewModel.summary.offlineCount;

  return (
    <aside className="home-insight-rail home-ops-rail">
      <section className="home-ops-rail__panel home-ops-rail__panel--time">
        <strong className="home-ops-rail__clock">{viewModel.timeline.time}</strong>
        <span className="home-ops-rail__date">{viewModel.timeline.date}</span>
      </section>

      <section className="home-ops-rail__panel home-weather-panel">
        <div className="home-weather-panel__current">
          <div>
            <span className="card-eyebrow">天气</span>
            <strong>{viewModel.timeline.weatherTemperature}</strong>
            <p>{viewModel.timeline.weatherCondition}</p>
          </div>
          <div className="home-weather-panel__meta">
            <span>湿度 {viewModel.timeline.humidity}</span>
            <span>{viewModel.cacheMode ? "缓存模式" : "实时刷新"}</span>
          </div>
        </div>
        <div className="home-weather-panel__trend">
          {viewModel.weatherTrend.map((point) => (
            <article
              key={point.key}
              className={
                point.emphasis
                  ? "home-weather-panel__trend-card is-active"
                  : "home-weather-panel__trend-card"
              }
            >
              <span>{point.label}</span>
              <b>{point.icon}</b>
              <strong>{point.high}</strong>
              <small>{point.low}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="home-ops-rail__panel home-carousel-panel">
        <div className="home-ops-rail__section-header">
          <span className="card-eyebrow">滑动栏目</span>
          <div className="home-ops-rail__switcher">
            <button
              aria-label="上一张"
              onClick={() =>
                setRailCardIndex((current) =>
                  current === 0 ? railCards.length - 1 : current - 1,
                )
              }
              type="button"
            >
              ‹
            </button>
            <button
              aria-label="下一张"
              onClick={() =>
                setRailCardIndex((current) => (current + 1) % railCards.length)
              }
              type="button"
            >
              ›
            </button>
          </div>
        </div>
        {activeRailCard ? (
          <article className="home-carousel-panel__card">
            <span>{activeRailCard.eyebrow}</span>
            <strong>{activeRailCard.title}</strong>
            <p>{activeRailCard.subtitle}</p>
            <div className="home-carousel-panel__metrics">
              {activeRailCard.metrics.slice(0, 2).map((metric) => (
                <div key={`${activeRailCard.key}-${metric.label}`}>
                  <small>{metric.label}</small>
                  <b>{metric.value}</b>
                </div>
              ))}
            </div>
          </article>
        ) : null}
        <div className="home-ops-rail__dots">
          {railCards.map((card, index) => (
            <button
              key={card.key}
              aria-label={card.title}
              className={index === railCardIndex ? "is-active" : ""}
              onClick={() => setRailCardIndex(index)}
              type="button"
            />
          ))}
        </div>
      </section>

      <section className="home-ops-rail__panel home-media-panel">
        <div className="home-ops-rail__section-header">
          <span className="card-eyebrow">媒体</span>
          <div className="home-ops-rail__switcher">
            <button
              aria-label="上一源"
              onClick={() =>
                setMediaIndex((current) =>
                  current === 0 ? mediaSources.length - 1 : current - 1,
                )
              }
              type="button"
            >
              ‹
            </button>
            <button
              aria-label="下一源"
              onClick={() => setMediaIndex((current) => (current + 1) % mediaSources.length)}
              type="button"
            >
              ›
            </button>
          </div>
        </div>
        <article className="home-media-panel__card">
          <span>{activeMedia.source}</span>
          <strong>{activeMedia.title}</strong>
          <p>{activeMedia.subtitle}</p>
          <div className="home-media-panel__footer">
            <em>{activeMedia.state}</em>
            <div className="home-ops-rail__dots">
              {mediaSources.map((source, index) => (
                <button
                  key={source.key}
                  aria-label={source.source}
                  className={index === mediaIndex ? "is-active" : ""}
                  onClick={() => setMediaIndex(index)}
                  type="button"
                />
              ))}
            </div>
          </div>
        </article>
      </section>

      <section className="home-ops-rail__panel home-fixed-action-panel">
        <div className="home-ops-rail__section-header">
          <span className="card-eyebrow">全屋入口</span>
          <span className="home-fixed-action-panel__summary">点按进入控制</span>
        </div>
        <div className="home-fixed-action-panel__grid">
          <button
            className="home-fixed-action-panel__tile is-gold"
            onClick={() => onOpenCluster("lights")}
            type="button"
          >
            <span>灯光</span>
            <strong>{lightsCount}</strong>
            <small>全屋开关与亮度</small>
          </button>
          <button
            className="home-fixed-action-panel__tile is-blue"
            onClick={() => onOpenCluster("climate")}
            type="button"
          >
            <span>温控</span>
            <strong>{climateCount}</strong>
            <small>空调与温度调整</small>
          </button>
          <button
            className="home-fixed-action-panel__tile"
            onClick={() => onOpenCluster("battery")}
            type="button"
          >
            <span>低电量</span>
            <strong>{batteryCount}</strong>
            <small>待现场更换电池</small>
          </button>
          <button
            className="home-fixed-action-panel__tile"
            onClick={() => onOpenCluster("offline")}
            type="button"
          >
            <span>离线</span>
            <strong>{offlineCount}</strong>
            <small>查看未在线设备</small>
          </button>
        </div>

        {viewModel.showFavoriteDevices && viewModel.favoriteDevices.length ? (
          <button
            className="home-fixed-action-panel__entry-link"
            onClick={() => onOpenFavoriteDevice(viewModel.favoriteDevices[0].deviceId)}
            type="button"
          >
            打开首页常用入口
          </button>
        ) : null}
      </section>
    </aside>
  );
}
