import { HomeHotspotViewModel } from "../../view-models/home";

interface HomeHotspotOverlayProps {
  hotspots: HomeHotspotViewModel[];
  selectedHotspotId: string | null;
  onSelectHotspot: (hotspotId: string | null) => void;
}

export function HomeHotspotOverlay({
  hotspots,
  selectedHotspotId,
  onSelectHotspot,
}: HomeHotspotOverlayProps) {
  return (
    <div className="home-hotspot-overlay">
      {hotspots.map((hotspot) => {
        const selected = hotspot.id === selectedHotspotId;
        return (
          <button
            key={hotspot.id}
            aria-label={hotspot.label}
            className={[
              "home-hotspot-overlay__item",
              `is-${hotspot.tone}`,
              hotspot.isOffline ? "is-offline" : "",
              selected ? "is-selected" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onSelectHotspot(selected ? null : hotspot.id)}
            style={{ left: `${hotspot.x * 100}%`, top: `${hotspot.y * 100}%` }}
            type="button"
          >
            <i className="home-hotspot-overlay__pulse" />
            <span className="home-hotspot-overlay__dot">
              <b>{hotspot.iconGlyph}</b>
            </span>
            <span className="home-hotspot-overlay__label-card">
              <strong>{hotspot.label}</strong>
              <small>{hotspot.statusSummary ?? hotspot.statusLabel}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
}
