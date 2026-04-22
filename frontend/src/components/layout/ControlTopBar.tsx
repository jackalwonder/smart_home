import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAppStore } from "../../store/useAppStore";
import { TopNavTabs } from "./TopNavTabs";
import { SystemStatusIcons } from "./SystemStatusIcons";

function formatNow(date: Date) {
  return {
    time: date.toLocaleTimeString("zh-CN", { hour12: false }),
    date: date.toLocaleDateString("zh-CN", {
      month: "long",
      day: "numeric",
      weekday: "long",
    }),
  };
}

function resolveWeatherDataStatus(homeData: Record<string, unknown> | null) {
  if (!homeData) {
    return null;
  }

  const sidebar = homeData.sidebar;
  const weather =
    sidebar && typeof sidebar === "object"
      ? (sidebar as { weather?: unknown }).weather
      : null;
  const weatherCacheMode =
    weather && typeof weather === "object"
      ? (weather as { cache_mode?: unknown }).cache_mode
      : undefined;
  const cacheMode = weatherCacheMode ?? homeData.cache_mode;

  if (typeof cacheMode !== "boolean") {
    return null;
  }

  return cacheMode ? "过时" : "实时";
}

export function ControlTopBar() {
  const session = useAppStore((state) => state.session);
  const pin = useAppStore((state) => state.pin);
  const realtime = useAppStore((state) => state.realtime);
  const home = useAppStore((state) => state.home);
  const location = useLocation();
  const navigate = useNavigate();
  const [now, setNow] = useState(() => formatNow(new Date()));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(formatNow(new Date()));
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const features = session.data?.features ?? {
    music_enabled: false,
    energy_enabled: false,
    editor_enabled: false,
  };
  const normalizedRealtimeStatus = realtime.connectionStatus.toLowerCase();
  const realtimeConnected = normalizedRealtimeStatus === "connected";
  const realtimeLabel =
    normalizedRealtimeStatus === "connected"
      ? "HA Connected"
      : normalizedRealtimeStatus === "reconnecting"
        ? `HA Retry ${Math.max(realtime.reconnectAttempt, 1)}`
        : normalizedRealtimeStatus === "connecting"
          ? "HA Connecting"
          : "HA Waiting";
  const weatherDataStatus = resolveWeatherDataStatus(home.data);
  const isHomeRoute = location.pathname === "/";
  const isHomeEditing = isHomeRoute && new URLSearchParams(location.search).get("edit") === "1";

  function openHomeEditor() {
    if (!pin.active) {
      navigate("/settings?section=home");
      return;
    }
    navigate("/?edit=1");
  }

  return (
    <header className="control-top-bar">
      <div className="control-top-bar__brand">
        <div className="control-top-bar__mini-clock">
          <strong>{now.time.slice(0, 5)}</strong>
          <span>{now.date}</span>
        </div>
        <div className="control-top-bar__logo">S</div>
        <div className="control-top-bar__brand-copy">
          <strong>Shadow</strong>
          <span>家庭智能中控</span>
        </div>
        <span
          className={
            realtimeConnected
              ? "control-top-bar__ha-pill is-online"
              : normalizedRealtimeStatus === "reconnecting"
                ? "control-top-bar__ha-pill is-warning"
                : "control-top-bar__ha-pill"
          }
        >
          {realtimeLabel}
        </span>
      </div>

      <TopNavTabs />

      <div className="control-top-bar__status">
        <SystemStatusIcons
          connected={realtimeConnected}
          featureFlags={[
            { label: "音乐", active: features.music_enabled },
            { label: "能耗", active: features.energy_enabled },
            { label: "编辑", active: features.editor_enabled },
          ]}
          inlineAction={
            isHomeRoute ? (
              <button
                aria-pressed={isHomeEditing}
                className={
                  isHomeEditing
                    ? "signal-pill signal-pill--action is-active"
                    : "signal-pill signal-pill--action"
                }
                onClick={openHomeEditor}
                type="button"
              >
                编辑首页
              </button>
            ) : null
          }
          pinVerified={pin.active}
        />
        <div className="control-top-bar__quick-status" aria-label="系统快速状态">
          {weatherDataStatus ? (
            <span
              className={
                weatherDataStatus === "实时"
                  ? "control-top-bar__weather-pill is-live"
                  : "control-top-bar__weather-pill is-stale"
              }
            >
              天气 {weatherDataStatus}
            </span>
          ) : null}
          <span>Wi-Fi</span>
          <span>98%</span>
        </div>
        <div className="control-top-bar__clock">
          <strong>{now.time}</strong>
          <span>{now.date}</span>
        </div>
      </div>
    </header>
  );
}
