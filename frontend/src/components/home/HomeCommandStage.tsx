import { HomeHotspotViewModel } from "../../view-models/home";
import { HomeDeviceControlPanel } from "./HomeDeviceControlPanel";
import { HomeHotspotOverlay } from "./HomeHotspotOverlay";

interface HomeCommandStageProps {
  backgroundImageUrl: string | null;
  hotspots: HomeHotspotViewModel[];
  selectedHotspotId: string | null;
  onSelectHotspot: (hotspotId: string | null) => void;
  cacheMode: boolean;
}

export function HomeCommandStage({
  backgroundImageUrl,
  hotspots,
  selectedHotspotId,
  onSelectHotspot,
  cacheMode,
}: HomeCommandStageProps) {
  const selectedHotspot = hotspots.find((hotspot) => hotspot.id === selectedHotspotId) ?? null;

  return (
    <section className="panel home-command-stage">
      <div className="panel__header">
        <div>
          <span className="card-eyebrow">Control Center</span>
          <h2>家庭总览</h2>
        </div>
        <div className="badge-row">
          <span className="state-chip">{cacheMode ? "缓存模式" : "实时模式"}</span>
          <span className="state-chip">{hotspots.length} 个热点</span>
        </div>
      </div>

      <div className="home-command-stage__surface">
        <div className="home-command-stage__canvas">
          {backgroundImageUrl ? (
            <img
              alt="家庭户型图"
              className="home-command-stage__image"
              src={backgroundImageUrl}
            />
          ) : (
            <div className="floorplan-fallback home-command-stage__placeholder" aria-hidden="true">
              <span className="floorplan-fallback__room floorplan-fallback__room--living" />
              <span className="floorplan-fallback__room floorplan-fallback__room--kitchen" />
              <span className="floorplan-fallback__room floorplan-fallback__room--bedroom" />
              <span className="floorplan-fallback__room floorplan-fallback__room--study" />
              <span className="floorplan-fallback__room floorplan-fallback__room--bath" />
              <span className="floorplan-fallback__wall floorplan-fallback__wall--one" />
              <span className="floorplan-fallback__wall floorplan-fallback__wall--two" />
              <span className="floorplan-fallback__wall floorplan-fallback__wall--three" />
            </div>
          )}
          <HomeHotspotOverlay
            hotspots={hotspots}
            onSelectHotspot={onSelectHotspot}
            selectedHotspotId={selectedHotspotId}
          />
          {selectedHotspot ? (
            <HomeDeviceControlPanel
              hotspot={selectedHotspot}
              onClose={() => onSelectHotspot(null)}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
