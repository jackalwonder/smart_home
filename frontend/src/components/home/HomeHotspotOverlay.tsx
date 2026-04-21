import { useRef } from "react";
import { HomeHotspotViewModel } from "../../view-models/home";
import { HotspotIcon } from "./HotspotIcon";

interface HomeHotspotOverlayProps {
  hotspots: HomeHotspotViewModel[];
  pendingHotspotIds?: string[];
  selectedHotspotId: string | null;
  onActivateHotspot: (hotspot: HomeHotspotViewModel) => void;
  onLongPressHotspot: (hotspot: HomeHotspotViewModel) => void;
}

const LONG_PRESS_MS = 520;

export function HomeHotspotOverlay({
  hotspots,
  pendingHotspotIds = [],
  selectedHotspotId,
  onActivateHotspot,
  onLongPressHotspot,
}: HomeHotspotOverlayProps) {
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  function clearLongPressTimer() {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  return (
    <div className="home-hotspot-overlay">
      {hotspots.map((hotspot) => {
        const selected = hotspot.id === selectedHotspotId;
        const pending = pendingHotspotIds.includes(hotspot.id);
        return (
          <button
            key={hotspot.id}
            aria-label={hotspot.label}
            aria-busy={pending || undefined}
            className={[
              "home-hotspot-overlay__item",
              `is-${hotspot.tone}`,
              hotspot.isOffline ? "is-offline" : "",
              selected ? "is-selected" : "",
              pending ? "is-pending" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => {
              if (longPressTriggeredRef.current) {
                longPressTriggeredRef.current = false;
                return;
              }
              onActivateHotspot(hotspot);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              clearLongPressTimer();
              onLongPressHotspot(hotspot);
            }}
            onKeyDown={(event) => {
              if ((event.key === "Enter" || event.key === " ") && event.shiftKey) {
                event.preventDefault();
                onLongPressHotspot(hotspot);
              }
            }}
            onPointerCancel={clearLongPressTimer}
            onPointerDown={(event) => {
              if (event.pointerType === "mouse" && event.button !== 0) {
                return;
              }
              clearLongPressTimer();
              longPressTriggeredRef.current = false;
              longPressTimerRef.current = window.setTimeout(() => {
                longPressTriggeredRef.current = true;
                onLongPressHotspot(hotspot);
              }, LONG_PRESS_MS);
            }}
            onPointerLeave={clearLongPressTimer}
            onPointerUp={clearLongPressTimer}
            style={{ left: `${hotspot.x * 100}%`, top: `${hotspot.y * 100}%` }}
            type="button"
          >
            <span className="home-hotspot-overlay__dot">
              <HotspotIcon
                deviceType={hotspot.deviceType}
                iconAssetUrl={hotspot.iconAssetUrl}
                iconType={hotspot.iconType}
                isOffline={hotspot.isOffline}
                status={hotspot.status}
                variant="home"
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}
