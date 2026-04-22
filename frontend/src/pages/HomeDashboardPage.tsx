import { useEffect, useMemo, useState } from "react";
import { fetchDeviceDetail, fetchDevices } from "../api/devicesApi";
import { fetchHomeOverview } from "../api/homeApi";
import { normalizeApiError } from "../api/httpClient";
import { DeviceListItemDto } from "../api/types";
import { BottomStatsStrip } from "../components/home/BottomStatsStrip";
import {
  isPowerControlSchema,
  nextPowerValueFromState,
  submitDeviceControl,
} from "../components/home/deviceControlHelpers";
import {
  HomeClusterControlModal,
  HomeClusterKey,
} from "../components/home/HomeClusterControlModal";
import { HomeCommandStage } from "../components/home/HomeCommandStage";
import { HomeHotspotControlModal } from "../components/home/HomeHotspotControlModal";
import { HomeInsightRail } from "../components/home/HomeInsightRail";
import { PageFrame } from "../components/layout/PageFrame";
import { appStore, useAppStore } from "../store/useAppStore";
import {
  homeFavoriteDeviceToHotspot,
  mapHomeOverviewViewModel,
  HomeHotspotViewModel,
} from "../view-models/home";
import { formatRealtimeEvent } from "../ws/eventPresentation";

type HotspotModalState = {
  hotspot: HomeHotspotViewModel;
  mode: "detail" | "group";
};

export function HomeDashboardPage() {
  const session = useAppStore((state) => state.session);
  const home = useAppStore((state) => state.home);
  const realtime = useAppStore((state) => state.realtime);
  const events = useAppStore((state) => state.wsEvents);
  const [devices, setDevices] = useState<DeviceListItemDto[]>([]);
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null);
  const [selectedFavoriteDeviceId, setSelectedFavoriteDeviceId] = useState<string | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<HomeClusterKey | null>(null);
  const [selectedHotspotModal, setSelectedHotspotModal] =
    useState<HotspotModalState | null>(null);
  const [pendingHotspotControls, setPendingHotspotControls] = useState<
    Record<string, boolean>
  >({});

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
  const pendingHotspotIds = useMemo(
    () =>
      Object.entries(pendingHotspotControls)
        .filter(([, pending]) => pending)
        .map(([hotspotId]) => hotspotId),
    [pendingHotspotControls],
  );

  function setHotspotPending(hotspotId: string, pending: boolean) {
    setPendingHotspotControls((current) => ({ ...current, [hotspotId]: pending }));
  }

  async function handleActivateHotspot(hotspot: HomeHotspotViewModel) {
    if (pendingHotspotControls[hotspot.id]) {
      return;
    }

    setSelectedCluster(null);
    setSelectedFavoriteDeviceId(null);
    setSelectedHotspotModal(null);

    const openDetailModal = () => {
      setSelectedHotspotId(null);
      setSelectedHotspotModal({ hotspot, mode: "detail" });
    };

    if (
      !hotspot.deviceId ||
      hotspot.isOffline ||
      hotspot.isReadonly ||
      hotspot.isComplex
    ) {
      openDetailModal();
      return;
    }

    setHotspotPending(hotspot.id, true);
    try {
      const detail = await fetchDeviceDetail(hotspot.deviceId);
      const powerIndex = detail.control_schema.findIndex(isPowerControlSchema);
      const powerSchema = detail.control_schema[powerIndex];
      const canQuickToggle =
        powerSchema &&
        detail.control_schema.length <= 2 &&
        !detail.is_offline &&
        !detail.is_readonly_device &&
        !detail.is_complex_device;

      if (!canQuickToggle) {
        openDetailModal();
        return;
      }

      const nextValue = nextPowerValueFromState(
        detail.runtime_state?.aggregated_state ?? detail.status ?? hotspot.status,
        detail.is_offline,
      );
      setSelectedHotspotId(null);
      const result = await submitDeviceControl({
        deviceId: detail.device_id,
        schema: powerSchema,
        value: nextValue,
        requestPrefix: "hotspot",
      });

      if (result && result.execution_status !== "SUCCESS") {
        openDetailModal();
      }
    } catch {
      openDetailModal();
    } finally {
      setHotspotPending(hotspot.id, false);
    }
  }

  function handleOpenHotspotGroup(hotspot: HomeHotspotViewModel) {
    setSelectedCluster(null);
    setSelectedFavoriteDeviceId(null);
    setSelectedHotspotId(null);
    setSelectedHotspotModal({ hotspot, mode: "group" });
  }

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
          backgroundImageSize={viewModel.stage.backgroundImageSize}
          cacheMode={viewModel.cacheMode}
          connectionStatus={realtime.connectionStatus}
          events={formattedEvents}
          hotspots={viewModel.stage.hotspots}
          onActivateHotspot={(hotspot) => {
            void handleActivateHotspot(hotspot);
          }}
          onClearSelectedExternalHotspot={() => setSelectedFavoriteDeviceId(null)}
          onLongPressHotspot={handleOpenHotspotGroup}
          onSelectHotspot={(hotspotId) => {
            setSelectedCluster(null);
            setSelectedFavoriteDeviceId(null);
            setSelectedHotspotModal(null);
            setSelectedHotspotId(hotspotId);
          }}
          pendingHotspotIds={pendingHotspotIds}
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
      <HomeHotspotControlModal
        devices={devices}
        hotspot={selectedHotspotModal?.hotspot ?? null}
        mode={selectedHotspotModal?.mode ?? "group"}
        onClose={() => setSelectedHotspotModal(null)}
        open={selectedHotspotModal !== null}
      />
    </section>
  );
}
