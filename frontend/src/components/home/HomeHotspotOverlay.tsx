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
      {hotspots.map((hotspot) => (
        <button
          key={hotspot.id}
          className={
            hotspot.id === selectedHotspotId
              ? `home-hotspot-overlay__item is-selected is-${hotspot.tone}`
              : hotspot.isOffline
                ? `home-hotspot-overlay__item is-offline is-${hotspot.tone}`
                : `home-hotspot-overlay__item is-${hotspot.tone}`
          }
          onClick={() => onSelectHotspot(hotspot.id)}
          style={{ left: `${hotspot.x * 100}%`, top: `${hotspot.y * 100}%` }}
          type="button"
        >
          <i className="home-hotspot-overlay__pulse" />
          <b>{hotspot.iconGlyph}</b>
          <span>{hotspot.label}</span>
          <small>{hotspot.statusSummary ?? hotspot.statusLabel}</small>
          <em>{hotspot.entryBehaviorLabel}</em>
        </button>
      ))}
    </div>
  );
}
