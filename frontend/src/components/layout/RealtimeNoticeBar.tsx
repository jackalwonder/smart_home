import { useEffect } from "react";
import { appStore, useAppStore } from "../../store/useAppStore";

export function RealtimeNoticeBar() {
  const session = useAppStore((state) => state.session);
  const realtime = useAppStore((state) => state.realtime);

  useEffect(() => {
    if (realtime.connectionStatus !== "connected" || !realtime.notice) {
      return;
    }
    const timer = window.setTimeout(() => {
      appStore.clearRealtimeNotice();
    }, 4_000);
    return () => window.clearTimeout(timer);
  }, [realtime.connectionStatus, realtime.notice]);

  if (session.status !== "success" || !realtime.notice) {
    return null;
  }

  const tone =
    realtime.connectionStatus === "reconnecting" || realtime.connectionStatus === "disconnected"
      ? "is-warning"
      : realtime.connectionStatus === "connected"
        ? "is-success"
        : "is-info";

  return (
    <div className={`realtime-notice-bar ${tone}`} role="status">
      <strong>实时链路</strong>
      <span>{realtime.notice}</span>
    </div>
  );
}
