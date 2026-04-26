import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fetchDeviceDetail, fetchDevices } from "../../api/devicesApi";
import { fetchHomeOverview } from "../../api/homeApi";
import { normalizeApiError } from "../../api/httpClient";
import { DeviceListItemDto } from "../../api/types";
import { appStore, useAppStore } from "../../store/useAppStore";
import {
  homeFavoriteDeviceToHotspot,
  mapHomeOverviewViewModel,
  HomeHotspotViewModel,
} from "../../view-models/home";
import { formatRealtimeEvent } from "../../ws/eventPresentation";
import {
  isPowerControlSchema,
  nextPowerValueFromState,
  submitDeviceControl,
} from "./deviceControlHelpers";
import { HomeClusterKey } from "./HomeClusterControlModal";
import { deviceListItemToHotspot, isClimateDevice } from "./homeClimateDevices";

type HotspotModalState = {
  hotspot: HomeHotspotViewModel;
  mode: "detail" | "group";
};

export function useHomeDashboardController() {
  const session = useAppStore((state) => state.session);
  const pin = useAppStore((state) => state.pin);
  const home = useAppStore((state) => state.home);
  const realtime = useAppStore((state) => state.realtime);
  const events = useAppStore((state) => state.wsEvents);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [devices, setDevices] = useState<DeviceListItemDto[]>([]);
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<HomeClusterKey | null>(null);
  const [selectedHotspotModal, setSelectedHotspotModal] = useState<HotspotModalState | null>(
    null,
  );
  const [climatePickerOpen, setClimatePickerOpen] = useState(false);
  const [pendingHotspotControls, setPendingHotspotControls] = useState<
    Record<string, boolean>
  >({});
  const [dashboardReloadToken, setDashboardReloadToken] = useState(0);

  const homeEditRequested = searchParams.get("edit") === "1";
  const isHomeEditing = homeEditRequested && pin.active;
  const isHomeEditBlocked = homeEditRequested && !pin.active;

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
        appStore.setHomeData(overview);
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
  }, [dashboardReloadToken, session.data?.accessToken, session.status]);

  const viewModel = mapHomeOverviewViewModel(home.data);
  const formattedEvents = useMemo(
    () =>
      events.slice(0, 6).map((event) => ({
        id: event.event_id,
        ...formatRealtimeEvent(event),
      })),
    [events],
  );
  const pendingHotspotIds = useMemo(
    () =>
      Object.entries(pendingHotspotControls)
        .filter(([, pending]) => pending)
        .map(([hotspotId]) => hotspotId),
    [pendingHotspotControls],
  );
  const climateDevices = useMemo(() => devices.filter(isClimateDevice), [devices]);

  function setHotspotPending(hotspotId: string, pending: boolean) {
    setPendingHotspotControls((current) => ({ ...current, [hotspotId]: pending }));
  }

  function setHomeEditMode(enabled: boolean) {
    const nextParams = new URLSearchParams(searchParams);
    if (enabled) {
      nextParams.set("edit", "1");
    } else {
      nextParams.delete("edit");
    }
    setSearchParams(nextParams, { replace: true });
  }

  function closeHomeEditor() {
    setHomeEditMode(false);
  }

  function openAdvancedHomeSettings() {
    navigate("/settings?section=home");
  }

  async function handleActivateHotspot(hotspot: HomeHotspotViewModel) {
    if (pendingHotspotControls[hotspot.id]) {
      return;
    }

    setSelectedCluster(null);
    setClimatePickerOpen(false);
    setSelectedHotspotModal(null);

    const openDetailModal = () => {
      setSelectedHotspotId(null);
      setSelectedHotspotModal({ hotspot, mode: "detail" });
    };

    if (!hotspot.deviceId || hotspot.isOffline || hotspot.isReadonly || hotspot.isComplex) {
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
    setClimatePickerOpen(false);
    setSelectedHotspotId(null);
    setSelectedHotspotModal({ hotspot, mode: "group" });
  }

  function handleOpenFavoriteDevice(deviceId: string) {
    const favoriteDeviceIndex = viewModel.favoriteDevices.findIndex(
      (device) => device.deviceId === deviceId,
    );
    if (favoriteDeviceIndex < 0) {
      return;
    }
    setSelectedCluster(null);
    setClimatePickerOpen(false);
    setSelectedHotspotId(null);
    setSelectedHotspotModal({
      hotspot: homeFavoriteDeviceToHotspot(
        viewModel.favoriteDevices[favoriteDeviceIndex],
        favoriteDeviceIndex,
      ),
      mode: "detail",
    });
  }

  function openClimateDeviceDetail(device: DeviceListItemDto) {
    setClimatePickerOpen(false);
    setSelectedCluster(null);
    setSelectedHotspotId(null);
    setSelectedHotspotModal({
      hotspot: deviceListItemToHotspot(device),
      mode: "detail",
    });
  }

  function handleOpenClimateEntry() {
    setSelectedHotspotId(null);
    setSelectedCluster(null);
    setSelectedHotspotModal(null);

    if (climateDevices.length === 1) {
      openClimateDeviceDetail(climateDevices[0]);
      return;
    }

    setClimatePickerOpen(true);
  }

  function handleOpenCluster(clusterKey: HomeClusterKey) {
    setSelectedHotspotId(null);
    setClimatePickerOpen(false);
    setSelectedHotspotModal(null);
    if (clusterKey === "climate") {
      handleOpenClimateEntry();
      return;
    }
    setSelectedCluster(clusterKey);
  }

  return {
    climateDevices,
    climatePickerOpen,
    closeHomeEditor,
    connectionStatus: realtime.connectionStatus,
    devices,
    formattedEvents,
    handleActivateHotspot,
    handleOpenCluster,
    handleOpenFavoriteDevice,
    handleOpenHotspotGroup,
    homeError: home.error,
    isHomeEditBlocked,
    isHomeEditing,
    onAppliedHomeEdit: async () => {
      setDashboardReloadToken((current) => current + 1);
    },
    openAdvancedHomeSettings,
    openClimateDeviceDetail,
    pendingHotspotIds,
    selectedCluster,
    selectedHotspotId,
    selectedHotspotModal,
    setClimatePickerOpen,
    setSelectedCluster,
    setSelectedHotspotId,
    setSelectedHotspotModal,
    viewModel,
  };
}
