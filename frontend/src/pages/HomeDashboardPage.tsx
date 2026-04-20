import { useEffect, useMemo, useState } from "react";
import { fetchDevices } from "../api/devicesApi";
import { fetchHomeOverview } from "../api/homeApi";
import { normalizeApiError } from "../api/httpClient";
import { DeviceListItemDto } from "../api/types";
import { BottomStatsStrip } from "../components/home/BottomStatsStrip";
import {
  HomeClusterControlModal,
  HomeClusterKey,
} from "../components/home/HomeClusterControlModal";
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
  const [devices, setDevices] = useState<DeviceListItemDto[]>([]);
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null);
  const [selectedFavoriteDeviceId, setSelectedFavoriteDeviceId] = useState<string | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<HomeClusterKey | null>(null);

  useEffect(() => {
    if (session.status !== "success") {
      return;
    }
    let active = true;

    void (async () => {
      appStore.setHomeLoading();
      try {
        const [overview, deviceDirectory] = await Promise.all([
          fetchHomeOverview(),
          fetchDevices({ page: 1, page_size: 200 }),
        ]);
        if (!active) {
          return;
        }
        appStore.setHomeData(overview as unknown as Record<string, unknown>);
        setDevices(deviceDirectory.items ?? []);
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

  const formattedEvents = useMemo(
    () => events.slice(0, 6).map(formatRealtimeEvent),
    [events],
  );

  return (
    <section className="page page--home">
      {home.error ? <p className="inline-error">{home.error}</p> : null}
      <PageFrame
        aside={
          <HomeInsightRail
            devices={devices}
            onOpenCluster={(clusterKey) => {
              setSelectedHotspotId(null);
              setSelectedFavoriteDeviceId(null);
              setSelectedCluster(clusterKey);
            }}
            onOpenFavoriteDevice={(deviceId) => {
              setSelectedCluster(null);
              setSelectedHotspotId(null);
              setSelectedFavoriteDeviceId(deviceId);
            }}
            viewModel={viewModel}
          />
        }
        className="page-frame--home"
        footer={<BottomStatsStrip stats={viewModel.bottomStats} />}
      >
        <HomeCommandStage
          backgroundImageUrl={viewModel.stage.backgroundImageUrl}
          cacheMode={viewModel.cacheMode}
          connectionStatus={realtime.connectionStatus}
          events={formattedEvents}
          hotspots={viewModel.stage.hotspots}
          onClearSelectedExternalHotspot={() => setSelectedFavoriteDeviceId(null)}
          onSelectHotspot={(hotspotId) => {
            setSelectedCluster(null);
            setSelectedFavoriteDeviceId(null);
            setSelectedHotspotId(hotspotId);
          }}
          selectedExternalHotspot={selectedFavoriteHotspot}
          selectedHotspotId={selectedHotspotId}
        />
      </PageFrame>

      <HomeClusterControlModal
        cluster={selectedCluster}
        devices={devices}
        onClose={() => setSelectedCluster(null)}
        open={selectedCluster !== null}
      />
    </section>
  );
}
