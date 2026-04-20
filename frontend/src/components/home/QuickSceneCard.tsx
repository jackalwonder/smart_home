import { Link } from "react-router-dom";
import {
  HomeFavoriteDeviceViewModel,
  HomeQuickActionViewModel,
} from "../../view-models/home";

interface QuickSceneCardProps {
  actions: HomeQuickActionViewModel[];
  favoriteDevices: HomeFavoriteDeviceViewModel[];
  showFavoriteDevices: boolean;
  onOpenFavoriteDevice: (deviceId: string) => void;
}

function actionGlyph(title: string) {
  if (title.includes("首页常用") || title.includes("收藏")) {
    return "常";
  }
  if (title.includes("场景")) {
    return "景";
  }
  if (title.includes("媒体")) {
    return "媒";
  }
  if (title.includes("能耗")) {
    return "能";
  }
  return "入";
}

function favoriteDeviceToneClass(tone: HomeFavoriteDeviceViewModel["tone"]) {
  if (tone === "warm") {
    return "is-warm";
  }
  if (tone === "neutral") {
    return "is-neutral";
  }
  return "is-accent";
}

export function QuickSceneCard({
  actions,
  favoriteDevices,
  showFavoriteDevices,
  onOpenFavoriteDevice,
}: QuickSceneCardProps) {
  const entryCount =
    actions.length + (showFavoriteDevices ? favoriteDevices.length : 0);

  return (
    <section className="utility-card quick-scene-card">
      <div className="quick-scene-card__header">
        <div>
          <span className="card-eyebrow">快捷入口</span>
          <h3>常用操作</h3>
        </div>
        <span className="state-chip">
          {entryCount ? `${entryCount} 个入口` : "等待配置"}
        </span>
      </div>

      <div className="quick-scene-card__body">
        {showFavoriteDevices ? (
          <section
            aria-label="首页常用设备"
            className="quick-scene-card__section"
          >
            <div className="quick-scene-card__section-header">
              <span>首页常用设备</span>
              <small>{favoriteDevices.length ? "点击即控" : "等待添加"}</small>
            </div>
            {favoriteDevices.length ? (
              <div className="home-favorite-device-list">
                {favoriteDevices.slice(0, 3).map((device) => (
                  <button
                    key={device.deviceId}
                    className={[
                      "home-favorite-device-row",
                      favoriteDeviceToneClass(device.tone),
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
                <p>把高频控制加入首页后，这里会自动变成最快入口。</p>
                <Link className="button button--ghost" to="/devices">
                  去设备页添加
                </Link>
              </div>
            )}
          </section>
        ) : null}

        {actions.length ? (
          <section className="quick-scene-card__section">
            <div className="quick-scene-card__section-header">
              <span>任务入口</span>
              <small>设置联动</small>
            </div>
            <div className="quick-scene-grid">
              {actions.map((action) => (
                <article key={action.key} className="quick-scene-grid__item">
                  <b>{actionGlyph(action.title)}</b>
                  <span>{action.title}</span>
                  <strong>{action.badgeCount}</strong>
                  <small>点按进入</small>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {!showFavoriteDevices && !actions.length ? (
          <p className="muted-copy">
            快捷入口当前已关闭，可以在设置里重新打开首页常用、场景或服务入口。
          </p>
        ) : null}
      </div>
    </section>
  );
}
