import { useResolvedAssetImageUrl } from "../../hooks/useResolvedAssetImageUrl";
import { HomeHotspotViewModel } from "../../view-models/home";
import { HomeDeviceControlPanel } from "./HomeDeviceControlPanel";
import { HomeHotspotOverlay } from "./HomeHotspotOverlay";

interface HomeCommandStageProps {
  backgroundImageUrl: string | null;
  hotspots: HomeHotspotViewModel[];
  selectedHotspotId: string | null;
  onSelectHotspot: (hotspotId: string | null) => void;
  selectedExternalHotspot?: HomeHotspotViewModel | null;
  onClearSelectedExternalHotspot?: () => void;
  cacheMode: boolean;
  connectionStatus: string;
  events: Array<{ title: string; subtitle: string }>;
}

function countRunningHotspots(hotspots: HomeHotspotViewModel[]) {
  return hotspots.filter((hotspot) => {
    const status = hotspot.status.toLowerCase();
    return (
      !hotspot.isOffline &&
      (status.includes("on") ||
        status.includes("open") ||
        status.includes("running") ||
        status.includes("playing"))
    );
  }).length;
}

function connectionCopy(status: string) {
  const normalizedStatus = status.toLowerCase();
  if (normalizedStatus === "connected") {
    return { label: "HA 已连接", tone: "is-online" };
  }
  if (normalizedStatus === "connecting" || normalizedStatus === "reconnecting") {
    return { label: "HA 连接中", tone: "is-warming" };
  }
  return { label: "HA 未连接", tone: "is-offline" };
}

export function HomeCommandStage({
  backgroundImageUrl,
  hotspots,
  selectedHotspotId,
  onSelectHotspot,
  selectedExternalHotspot = null,
  onClearSelectedExternalHotspot,
  cacheMode,
  connectionStatus,
  events,
}: HomeCommandStageProps) {
  const selectedStageHotspot =
    hotspots.find((hotspot) => hotspot.id === selectedHotspotId) ?? null;
  const selectedHotspot = selectedStageHotspot ?? selectedExternalHotspot;
  const resolvedBackgroundImageUrl = useResolvedAssetImageUrl(backgroundImageUrl);
  const onlineHotspots = hotspots.filter((hotspot) => !hotspot.isOffline).length;
  const runningHotspots = countRunningHotspots(hotspots);
  const { label: connectionLabel, tone: connectionTone } = connectionCopy(
    connectionStatus,
  );
  const feedItems = events.slice(0, 5);

  return (
    <section className="panel home-command-stage">
      <div className="home-command-stage__surface">
        <div className="home-command-stage__canvas">
          <div className="home-command-stage__ambient" aria-hidden="true" />

          <div className="home-command-stage__topline">
            <div className="home-command-stage__brand">
              <span className="card-eyebrow">Overview Console</span>
              <h2>家庭总览</h2>
              <p>主舞台直接看户型、热点和实时状态。</p>
            </div>
            <div className="home-command-stage__pill-row">
              <span className={`state-chip ${connectionTone}`}>{connectionLabel}</span>
              <span className="state-chip">{cacheMode ? "缓存模式" : "实时模式"}</span>
              <span className="state-chip">{`${onlineHotspots}/${hotspots.length || 0} 在线`}</span>
              <span className="state-chip">{`${runningHotspots} 个运行中`}</span>
            </div>
          </div>

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
                <strong>上传并发布背景图后，这里会成为首页主舞台。</strong>
                <p>先去编辑页上传户型图、摆好热点，再回到总览体验完整交互。</p>
              </div>
            </div>
          )}

          <div className="home-command-stage__stage-summary">
            <span>主舞台</span>
            <strong>{`${hotspots.length} 个设备热点`}</strong>
            <small>
              {selectedHotspot
                ? `当前正在查看：${selectedHotspot.label}`
                : "点击热点可直接操作，复杂设备会打开控制浮层。"}
            </small>
          </div>

          <HomeHotspotOverlay
            hotspots={hotspots}
            onSelectHotspot={onSelectHotspot}
            selectedHotspotId={selectedHotspotId}
          />

          {feedItems.length ? (
            <section className="home-stage-feed">
              <div className="home-stage-feed__header">
                <span className="card-eyebrow">实时动态</span>
                <strong>现场更新</strong>
              </div>
              <div className="home-stage-feed__list">
                {feedItems.map((event, index) => (
                  <article key={`${event.title}-${index}`} className="home-stage-feed__item">
                    <b />
                    <div>
                      <strong>{event.title}</strong>
                      <small>{event.subtitle}</small>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {selectedHotspot ? (
            <HomeDeviceControlPanel
              hotspot={selectedHotspot}
              onClose={() => {
                if (selectedStageHotspot) {
                  onSelectHotspot(null);
                  return;
                }
                onClearSelectedExternalHotspot?.();
              }}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
