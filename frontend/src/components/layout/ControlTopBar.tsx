import { useEffect, useState } from "react";
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

export function ControlTopBar() {
  const session = useAppStore((state) => state.session);
  const pin = useAppStore((state) => state.pin);
  const realtime = useAppStore((state) => state.realtime);
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
  const realtimeConnected = realtime.connectionStatus.toLowerCase() === "connected";

  return (
    <header className="control-top-bar">
      <div className="control-top-bar__brand">
        <div className="control-top-bar__logo">中控</div>
        <div className="control-top-bar__brand-copy">
          <strong>家庭智能中控</strong>
          <span>
            {realtimeConnected ? "HA 已连接" : "实时链路等待中"}
          </span>
        </div>
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
          pinVerified={pin.active}
        />
        <div className="control-top-bar__clock">
          <strong>{now.time}</strong>
          <span>{now.date}</span>
        </div>
      </div>
    </header>
  );
}
