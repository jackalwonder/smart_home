import { useMemo, useState } from "react";
import { DeviceListItemDto } from "../../api/types";
import { HomeViewModel } from "../../view-models/home";
import {
  FavoriteDevicesSlide,
  HomeMediaPlayerSlide,
  HomeRailWeatherBrief,
  NoticeControlsSlide,
  RailCarousel,
  RailSlide,
  WeatherTrendsSlide,
} from "./HomeInsightRailCards";
import { HomeClusterKey } from "./homeClusterControlModel";
import { buildInsightCounts, buildMediaSources } from "./homeInsightRailModel";

interface HomeInsightRailProps {
  viewModel: HomeViewModel;
  devices: DeviceListItemDto[];
  onOpenFavoriteDevice: (deviceId: string) => void;
  onOpenCluster: (key: HomeClusterKey) => void;
}

export function HomeInsightRail({
  viewModel,
  devices,
  onOpenCluster,
  onOpenFavoriteDevice,
}: HomeInsightRailProps) {
  const [featureIndex, setFeatureIndex] = useState(0);
  const [mediaIndex, setMediaIndex] = useState(0);

  const counts = useMemo(() => buildInsightCounts(viewModel, devices), [devices, viewModel]);
  const mediaSources = useMemo(
    () => buildMediaSources(viewModel, devices),
    [devices, viewModel],
  );

  const featureSlides = useMemo<RailSlide[]>(
    () => [
      ...(viewModel.showFavoriteDevices
        ? [
            {
              key: "favorites",
              label: "首页常用设备",
              content: (
                <FavoriteDevicesSlide
                  onOpenFavoriteDevice={onOpenFavoriteDevice}
                  viewModel={viewModel}
                />
              ),
            },
          ]
        : []),
      {
        key: "weather",
        label: "气象脉动",
        content: <WeatherTrendsSlide viewModel={viewModel} />,
      },
      {
        key: "notice",
        label: "通知功能键",
        content: <NoticeControlsSlide />,
      },
    ],
    [onOpenFavoriteDevice, viewModel],
  );

  const mediaSlides = useMemo<RailSlide[]>(
    () =>
      mediaSources.map((source) => ({
        key: source.key,
        label: source.source,
        content: <HomeMediaPlayerSlide source={source} />,
      })),
    [mediaSources],
  );

  return (
    <aside className="home-insight-rail home-status-rail">
      <HomeRailWeatherBrief viewModel={viewModel} />
      <section className="home-quick-grid" aria-label="全屋快捷入口">
        <button className="is-active" onClick={() => onOpenCluster("lights")} type="button">
          <span aria-hidden="true">♢</span>
          <strong>灯光</strong>
          <small>{counts.lights}</small>
        </button>
        <button onClick={() => onOpenCluster("climate")} type="button">
          <span aria-hidden="true">✣</span>
          <strong>温控</strong>
          <small>{counts.climate}</small>
        </button>
        <button onClick={() => onOpenCluster("battery")} type="button">
          <span aria-hidden="true">▣</span>
          <strong>低电量</strong>
          <small>{counts.battery}</small>
        </button>
        <button onClick={() => onOpenCluster("offline")} type="button">
          <span aria-hidden="true">ⓘ</span>
          <strong>离线</strong>
          <small>{counts.offline}</small>
        </button>
      </section>
      <RailCarousel
        activeIndex={featureIndex}
        ariaLabel="右侧功能轮播"
        onChange={setFeatureIndex}
        slides={featureSlides}
        variant="feature"
      />
      <RailCarousel
        activeIndex={mediaIndex}
        ariaLabel="右侧音频轮播"
        onChange={setMediaIndex}
        slides={mediaSlides}
        variant="media"
      />
    </aside>
  );
}
