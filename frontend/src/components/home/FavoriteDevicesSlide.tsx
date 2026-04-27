import { Link } from "react-router-dom";
import { HomeViewModel } from "../../view-models/home";

export function FavoriteDevicesSlide({
  viewModel,
  onOpenFavoriteDevice,
}: {
  viewModel: HomeViewModel;
  onOpenFavoriteDevice: (deviceId: string) => void;
}) {
  return (
    <section aria-label="首页常用设备" className="home-trends-slide home-favorite-rail-slide">
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
