import { HomeHotspotViewModel } from "../../view-models/home";
import { useResolvedAssetImageUrl } from "../../hooks/useResolvedAssetImageUrl";
import { HomeDeviceControlPanel } from "./HomeDeviceControlPanel";
import { HomeHotspotOverlay } from "./HomeHotspotOverlay";

interface HomeCommandStageProps {
  backgroundImageUrl: string | null;
  hotspots: HomeHotspotViewModel[];
  selectedHotspotId: string | null;
  onSelectHotspot: (hotspotId: string | null) => void;
  cacheMode: boolean;
  connectionStatus: string;
}

export function HomeCommandStage({
  backgroundImageUrl,
  hotspots,
  selectedHotspotId,
  onSelectHotspot,
  cacheMode,
  connectionStatus,
}: HomeCommandStageProps) {
  const selectedHotspot =
    hotspots.find((hotspot) => hotspot.id === selectedHotspotId) ?? null;
  const resolvedBackgroundImageUrl =
    useResolvedAssetImageUrl(backgroundImageUrl);
  const activeHotspots = hotspots.filter(
    (hotspot) => !hotspot.isOffline,
  ).length;
  const runningHotspots = hotspots.filter((hotspot) =>
    ["已开启", "运行中"].includes(hotspot.statusLabel),
  ).length;
  const hotspotStatusLabel = hotspots.length
    ? `${activeHotspots}/${hotspots.length} 在线`
    : "热点待发布";
  const normalizedStatus = connectionStatus.toLowerCase();
  const connectionTone =
    normalizedStatus === "connected"
      ? "is-online"
      : normalizedStatus === "connecting" || normalizedStatus === "reconnecting"
        ? "is-warming"
        : "is-offline";
  const connectionLabel =
    normalizedStatus === "connected"
      ? "HA 已连接"
      : normalizedStatus === "reconnecting"
        ? "HA 重连中"
        : normalizedStatus === "connecting"
          ? "HA 连接中"
          : "HA 未连接";

  return (
    <section className="panel home-command-stage">
      <div className="panel__header">
        <div>
          <span className="card-eyebrow">Control Center</span>
          <h2>家庭总览</h2>
        </div>
        <div className="badge-row">
          <span className="state-chip">
            {cacheMode ? "缓存模式" : "实时模式"}
          </span>
          <span className="state-chip">{hotspots.length} 个热点</span>
        </div>
      </div>

      <div className="home-command-stage__surface">
        <div className="home-command-stage__canvas">
          <div className="home-command-stage__ambient" aria-hidden="true" />
          {resolvedBackgroundImageUrl ? (
            <img
              alt="家庭户型图"
              className="home-command-stage__image"
              src={resolvedBackgroundImageUrl}
            />
          ) : (
            <div
              className="floorplan-fallback home-command-stage__placeholder"
              aria-hidden="true"
            >
              <span className="floorplan-fallback__room floorplan-fallback__room--living" />
              <span className="floorplan-fallback__room floorplan-fallback__room--kitchen" />
              <span className="floorplan-fallback__room floorplan-fallback__room--bedroom" />
              <span className="floorplan-fallback__room floorplan-fallback__room--study" />
              <span className="floorplan-fallback__room floorplan-fallback__room--bath" />
              <span className="floorplan-fallback__wall floorplan-fallback__wall--one" />
              <span className="floorplan-fallback__wall floorplan-fallback__wall--two" />
              <span className="floorplan-fallback__wall floorplan-fallback__wall--three" />
              <div className="home-command-stage__empty">
                <span className="card-eyebrow">户型图待发布</span>
                <strong>上传并发布背景图后，这里会成为家庭主控地图</strong>
                <p>先在编辑器上传户型图、摆放热点，再点“发布到首页”。</p>
              </div>
            </div>
          )}
          <div className="home-command-stage__statusbar">
            <div>
              <span className="card-eyebrow">Home Overview</span>
              <h2>家庭总览</h2>
              <p>点选户型图上的热点，查看状态或直接控制设备。</p>
            </div>
            <div className="home-command-stage__chips">
              <span className={`state-chip ${connectionTone}`}>
                {connectionLabel}
              </span>
              <span className="state-chip">
                {cacheMode ? "缓存模式" : "实时模式"}
              </span>
              <span className="state-chip">{hotspotStatusLabel}</span>
              <span className="state-chip">{runningHotspots} 个运行中</span>
            </div>
          </div>
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
