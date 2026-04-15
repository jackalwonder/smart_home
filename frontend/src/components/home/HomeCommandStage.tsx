import { HomeHotspotViewModel } from "../../view-models/home";
import { HomeHotspotOverlay } from "./HomeHotspotOverlay";
import { RoomFocusPopover } from "./RoomFocusPopover";

interface HomeCommandStageProps {
  backgroundImageUrl: string | null;
  hotspots: HomeHotspotViewModel[];
  selectedHotspotId: string | null;
  onSelectHotspot: (hotspotId: string) => void;
  cacheMode: boolean;
}

export function HomeCommandStage({
  backgroundImageUrl,
  hotspots,
  selectedHotspotId,
  onSelectHotspot,
  cacheMode,
}: HomeCommandStageProps) {
  const selectedHotspot =
    hotspots.find((hotspot) => hotspot.id === selectedHotspotId) ?? hotspots[0] ?? null;

  return (
    <section className="panel home-command-stage">
      <div className="panel__header">
        <div>
          <span className="card-eyebrow">中控主舞台</span>
          <h2>家庭总览</h2>
          <p className="muted-copy">以户型为核心，状态围绕四周展开，操作不压住空间本体。</p>
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
            <div className="home-command-stage__placeholder">
              当前还没有绑定最终户型资源，但热点和状态层已经可以先在这里承载。
            </div>
          )}
          <HomeHotspotOverlay
            hotspots={hotspots}
            onSelectHotspot={onSelectHotspot}
            selectedHotspotId={selectedHotspot?.id ?? null}
          />
        </div>
        <RoomFocusPopover hotspot={selectedHotspot} />
      </div>
    </section>
  );
}
