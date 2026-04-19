import { useEffect, useState } from "react";
import { fetchHomeOverview } from "../api/homeApi";
import { normalizeApiError } from "../api/httpClient";
import { BottomStatsStrip } from "../components/home/BottomStatsStrip";
import { HomeCommandStage } from "../components/home/HomeCommandStage";
import { HomeInsightRail } from "../components/home/HomeInsightRail";
import { PageFrame } from "../components/layout/PageFrame";
import { appStore, useAppStore } from "../store/useAppStore";
import {
  homeFavoriteDeviceToHotspot,
  mapHomeOverviewViewModel,
} from "../view-models/home";
import { formatRealtimeEvent } from "../ws/eventPresentation";

export function HomeDashboardPage() {
  const session = useAppStore((state) => state.session);
  const home = useAppStore((state) => state.home);
  const realtime = useAppStore((state) => state.realtime);
  const events = useAppStore((state) => state.wsEvents);
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(
    null,
  );
  const [selectedFavoriteDeviceId, setSelectedFavoriteDeviceId] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (session.status !== "success") {
      return;
    }
    let active = true;

    void (async () => {
      appStore.setHomeLoading();
      try {
        const data = await fetchHomeOverview();
        if (!active) {
          return;
        }
        appStore.setHomeData(data as unknown as Record<string, unknown>);
      } catch (error) {
        if (!active) {
          return;
        }
        appStore.setHomeError(normalizeApiError(error).message);
      }
    })();

    return () => {
      active = false;
    };
  }, [session.data?.accessToken, session.status]);

  const viewModel = mapHomeOverviewViewModel(home.data);
  const selectedFavoriteDeviceIndex = viewModel.favoriteDevices.findIndex(
    (device) => device.deviceId === selectedFavoriteDeviceId,
  );
  const selectedFavoriteHotspot =
    selectedFavoriteDeviceIndex >= 0
      ? homeFavoriteDeviceToHotspot(
          viewModel.favoriteDevices[selectedFavoriteDeviceIndex],
          selectedFavoriteDeviceIndex,
        )
      : null;

  return (
    <section className="page page--home">
      {home.error ? <p className="inline-error">{home.error}</p> : null}
      <PageFrame
        aside={
          <HomeInsightRail
            actions={viewModel.quickActions}
            date={viewModel.timeline.date}
            energyFields={viewModel.energyFields}
            favoriteDevices={viewModel.favoriteDevices}
            humidity={viewModel.timeline.humidity}
            mediaFields={viewModel.mediaFields}
            metrics={viewModel.metrics}
            onOpenFavoriteDevice={(deviceId) => {
              setSelectedHotspotId(null);
              setSelectedFavoriteDeviceId(deviceId);
            }}
            showFavoriteDevices={viewModel.showFavoriteDevices}
            time={viewModel.timeline.time}
            weatherCondition={viewModel.timeline.weatherCondition}
            weatherTemperature={viewModel.timeline.weatherTemperature}
          />
        }
        footer={
          <BottomStatsStrip
            connectionStatus={realtime.connectionStatus}
            events={events.slice(0, 4).map(formatRealtimeEvent)}
            stats={viewModel.bottomStats}
          />
        }
        className="page-frame--home"
      >
        <HomeCommandStage
          backgroundImageUrl={viewModel.stage.backgroundImageUrl}
          cacheMode={viewModel.cacheMode}
          connectionStatus={realtime.connectionStatus}
          hotspots={viewModel.stage.hotspots}
          onClearSelectedExternalHotspot={() =>
            setSelectedFavoriteDeviceId(null)
          }
          onSelectHotspot={(hotspotId) => {
            setSelectedFavoriteDeviceId(null);
            setSelectedHotspotId(hotspotId);
          }}
          selectedExternalHotspot={selectedFavoriteHotspot}
          selectedHotspotId={selectedHotspotId}
        />
      </PageFrame>
    </section>
  );
}
