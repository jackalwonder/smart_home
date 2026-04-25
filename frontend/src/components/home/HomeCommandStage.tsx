import { useEffect, useRef, useState } from "react";
import {
  readImageSize,
  useContainedImageFrame,
  useViewportSize,
} from "../../hooks/useContainedImageFrame";
import { useResolvedAssetImageUrl } from "../../hooks/useResolvedAssetImageUrl";
import { hasImageSize, type ImageSize } from "../../types/image";
import { HomeHotspotViewModel } from "../../view-models/home";
import { HomeHotspotOverlay } from "./HomeHotspotOverlay";

interface StageFeedItem {
  id: string;
  title: string;
  subtitle: string;
}

interface HomeCommandStageProps {
  backgroundImageUrl: string | null;
  backgroundImageSize: ImageSize | null;
  hotspots: HomeHotspotViewModel[];
  pendingHotspotIds?: string[];
  selectedHotspotId: string | null;
  onActivateHotspot: (hotspot: HomeHotspotViewModel) => void;
  onLongPressHotspot: (hotspot: HomeHotspotViewModel) => void;
  onSelectHotspot: (hotspotId: string | null) => void;
  cacheMode: boolean;
  connectionStatus: string;
  events: StageFeedItem[];
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

function latestFeedItems(events: StageFeedItem[]) {
  return events.slice(0, 3).reverse();
}

function sameFeedSequence(current: StageFeedItem[], next: StageFeedItem[]) {
  if (current.length !== next.length) {
    return false;
  }
  return current.every((item, index) => item.id === next[index]?.id);
}

export function HomeCommandStage({
  backgroundImageUrl,
  backgroundImageSize,
  hotspots,
  pendingHotspotIds = [],
  selectedHotspotId,
  onActivateHotspot,
  onLongPressHotspot,
  cacheMode,
  connectionStatus,
  events,
}: HomeCommandStageProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const feedTimeoutRef = useRef<number | null>(null);
  const [measuredBackgroundImageSize, setMeasuredBackgroundImageSize] =
    useState<ImageSize | null>(backgroundImageSize);
  const [displayedFeedItems, setDisplayedFeedItems] = useState<StageFeedItem[]>(() =>
    latestFeedItems(events),
  );
  const [fadingFeedItemId, setFadingFeedItemId] = useState<string | null>(null);
  const resolvedBackgroundImageUrl = useResolvedAssetImageUrl(backgroundImageUrl);
  const viewportSize = useViewportSize(viewportRef);
  const effectiveBackgroundImageSize = hasImageSize(backgroundImageSize)
    ? backgroundImageSize
    : measuredBackgroundImageSize;
  const imageFrame = useContainedImageFrame({
    hasBackgroundImage: Boolean(resolvedBackgroundImageUrl),
    imageSize: effectiveBackgroundImageSize,
    viewportSize,
  });
  const onlineHotspots = hotspots.filter((hotspot) => !hotspot.isOffline).length;
  const runningHotspots = countRunningHotspots(hotspots);
  const { label: connectionLabel, tone: connectionTone } = connectionCopy(connectionStatus);

  useEffect(() => {
    if (hasImageSize(backgroundImageSize)) {
      setMeasuredBackgroundImageSize(backgroundImageSize);
    }
  }, [backgroundImageSize]);

  useEffect(() => {
    return () => {
      if (feedTimeoutRef.current !== null) {
        window.clearTimeout(feedTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const nextFeedItems = latestFeedItems(events);

    setDisplayedFeedItems((currentFeedItems) => {
      if (sameFeedSequence(currentFeedItems, nextFeedItems)) {
        return currentFeedItems;
      }

      if (feedTimeoutRef.current !== null) {
        window.clearTimeout(feedTimeoutRef.current);
        feedTimeoutRef.current = null;
      }

      const outgoingItem = currentFeedItems[0] ?? null;
      const incomingItems = nextFeedItems.filter(
        (nextItem) => !currentFeedItems.some((currentItem) => currentItem.id === nextItem.id),
      );

      if (
        currentFeedItems.length === 3 &&
        nextFeedItems.length === 3 &&
        outgoingItem &&
        incomingItems.length > 0
      ) {
        const retainedItems = currentFeedItems.filter((item) => item.id !== outgoingItem.id);
        const transitionalItems = [...retainedItems, ...incomingItems];

        setFadingFeedItemId(outgoingItem.id);
        feedTimeoutRef.current = window.setTimeout(() => {
          setDisplayedFeedItems(nextFeedItems);
          setFadingFeedItemId(null);
          feedTimeoutRef.current = null;
        }, 420);

        return [outgoingItem, ...transitionalItems];
      }

      setFadingFeedItemId(null);
      return nextFeedItems;
    });
  }, [events]);

  return (
    <section className="panel home-command-stage">
      <div className="home-command-stage__surface">
        <div className="home-command-stage__canvas">
          <div className="home-command-stage__ambient" aria-hidden="true" />

          <div className="home-command-stage__topline">
            <div className="home-command-stage__pill-row">
              <span className={`state-chip ${connectionTone}`}>{connectionLabel}</span>
              <span className="state-chip">{cacheMode ? "缓存模式" : "实时模式"}</span>
              <span className="state-chip">{`${onlineHotspots}/${hotspots.length || 0} 在线`}</span>
              <span className="state-chip">{`${runningHotspots} 个运行中`}</span>
            </div>
          </div>

          <div className="home-command-stage__viewport" ref={viewportRef}>
            {resolvedBackgroundImageUrl ? (
              <img
                alt="家庭户型图"
                className="home-command-stage__image"
                onLoad={(event) => {
                  const nextSize = readImageSize(event.currentTarget);
                  if (nextSize) {
                    setMeasuredBackgroundImageSize(nextSize);
                  }
                }}
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
                  <strong>发布首页舞台前，先完成户型图和热点布点。</strong>
                  <p>
                    在设置里的首页高级设置上传户型图，再回到总览轻编辑放置常用设备热点。发布后，这里会展示可直接操作的家庭现场。
                  </p>
                </div>
              </div>
            )}

            {imageFrame ? (
              <div
                className="home-command-stage__hotspot-frame"
                style={{
                  left: `${imageFrame.left}px`,
                  top: `${imageFrame.top}px`,
                  width: `${imageFrame.width}px`,
                  height: `${imageFrame.height}px`,
                }}
              >
                <HomeHotspotOverlay
                  hotspots={hotspots}
                  onActivateHotspot={onActivateHotspot}
                  onLongPressHotspot={onLongPressHotspot}
                  pendingHotspotIds={pendingHotspotIds}
                  selectedHotspotId={selectedHotspotId}
                />
              </div>
            ) : null}
          </div>

          {displayedFeedItems.length ? (
            <section className="home-stage-feed">
              <div className="home-stage-feed__header">
                <span className="card-eyebrow">实时动态</span>
                <strong>现场更新</strong>
              </div>
              <div className="home-stage-feed__list">
                {displayedFeedItems.map((event) => (
                  <article
                    key={event.id}
                    className={[
                      "home-stage-feed__item",
                      fadingFeedItemId === event.id ? "is-fading" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
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
        </div>
      </div>
    </section>
  );
}
