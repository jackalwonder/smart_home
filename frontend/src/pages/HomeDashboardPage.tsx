import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { HomeStageEditorWorkspace } from "../components/home/HomeStageEditorWorkspace";
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

interface ClimateDevicePickerProps {
  devices: DeviceListItemDto[];
  onClose: () => void;
  onSelectDevice: (device: DeviceListItemDto) => void;
  open: boolean;
}

function normalizeDeviceKeyword(value: string | null | undefined) {
  return (value ?? "").toLowerCase();
}

function isClimateDevice(device: DeviceListItemDto) {
  const source = normalizeDeviceKeyword(device.device_type);
  return (
    source.includes("climate") ||
    source.includes("air") ||
    source.includes("fan") ||
    source.includes("fridge") ||
    source.includes("refrigerator")
  );
}

function formatClimateDeviceType(value: string | null | undefined) {
  const source = normalizeDeviceKeyword(value);
  if (source.includes("fridge") || source.includes("refrigerator")) {
    return "冰箱";
  }
  if (source.includes("air") || source.includes("climate")) {
    return "空调";
  }
  if (source.includes("fan")) {
    return "新风";
  }
  return "温控设备";
}

function formatDeviceControlBadge(device: DeviceListItemDto) {
  if (device.is_offline) {
    return device.is_readonly_device ? "离线 · 只读" : "离线 · 待恢复";
  }
  return device.is_readonly_device ? "在线 · 只读" : "在线 · 可控";
}

function deviceListItemToHotspot(device: DeviceListItemDto): HomeHotspotViewModel {
  return {
    id: `cluster-${device.device_id}`,
    deviceId: device.device_id,
    label: device.display_name,
    deviceType: device.device_type,
    deviceTypeLabel: device.device_type,
    x: 0,
    y: 0,
    iconGlyph: "温",
    tone: "accent",
    iconType: "device",
    iconAssetId: null,
    iconAssetUrl: null,
    labelMode: "ALWAYS",
    status: device.status,
    statusLabel: device.is_offline ? "离线" : device.status,
    statusSummary: null,
    isOffline: device.is_offline,
    isComplex: device.is_complex_device,
    isReadonly: device.is_readonly_device,
    entryBehavior: "VIEW",
    entryBehaviorLabel: "查看",
  };
}

function ClimateDevicePicker({
  devices,
  onClose,
  onSelectDevice,
  open,
}: ClimateDevicePickerProps) {
  if (!open) {
    return null;
  }

  const onlineCount = devices.filter((device) => !device.is_offline).length;
  const controllableCount = devices.filter(
    (device) => !device.is_offline && !device.is_readonly_device,
  ).length;

  return (
    <div
      aria-label="全屋温控"
      className="home-cluster-modal home-climate-picker"
      role="dialog"
      aria-modal="true"
    >
      <div className="home-cluster-modal__backdrop" onClick={onClose} aria-hidden="true" />
      <section className="home-cluster-modal__panel home-climate-picker__panel is-climate">
        <header className="home-cluster-modal__header home-climate-picker__header">
          <div className="home-cluster-modal__title-row">
            <span className="home-cluster-modal__glyph" aria-hidden="true">
              温
            </span>
            <div>
              <span className="card-eyebrow">温控设备</span>
              <h3>全屋温控</h3>
              <p>选择要调节的温控设备。</p>
            </div>
          </div>
          <div className="home-cluster-modal__header-meta">
            <span>{devices.length} 个设备</span>
            <span>{onlineCount} 个在线</span>
            <span>{controllableCount} 个可控</span>
          </div>
          <button
            aria-label="关闭温控选择"
            className="home-cluster-modal__close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        {devices.length ? (
          <div className="home-climate-picker__grid">
            {devices.map((device) => (
              <button
                className={[
                  "home-climate-picker__device",
                  device.is_offline ? "is-offline" : "",
                  device.is_readonly_device ? "is-readonly" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={device.device_id}
                onClick={() => onSelectDevice(device)}
                type="button"
              >
                <span className="home-climate-picker__icon" aria-hidden="true">
                  温
                </span>
                <span className="home-climate-picker__copy">
                  <strong>{device.display_name}</strong>
                  <small>
                    {device.room_name ?? "未分配房间"} · {formatClimateDeviceType(device.device_type)}
                  </small>
                </span>
                <span className="home-climate-picker__status">
                  {formatDeviceControlBadge(device)}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="home-cluster-modal__empty home-climate-picker__empty">
            <strong>当前没有温控设备</strong>
            <p>接入空调、冰箱、新风或其他温控设备后，这里会显示可选择的全屋温控入口。</p>
          </div>
        )}
      </section>
    </div>
  );
}

export function HomeDashboardPage() {
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
  const [selectedHotspotModal, setSelectedHotspotModal] =
    useState<HotspotModalState | null>(null);
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

  if (isHomeEditing) {
    return (
      <HomeStageEditorWorkspace
        devices={devices}
        onApplied={async () => {
          setDashboardReloadToken((current) => current + 1);
        }}
        onExit={closeHomeEditor}
        onOpenAdvancedSettings={openAdvancedHomeSettings}
        stats={viewModel.bottomStats}
      />
    );
  }

  return (
    <section className="page page--home">
      {home.error ? <p className="inline-error">{home.error}</p> : null}
      {isHomeEditBlocked ? (
        <section className="panel home-page-edit-gate">
          <div>
            <span className="card-eyebrow">首页轻编辑</span>
            <strong>请先在设置页验证管理 PIN</strong>
            <p className="muted-copy">
              总览轻编辑只负责舞台和热点的即时调整。验证管理 PIN 后，就可以直接回到总览页编辑首页。
            </p>
          </div>
          <div className="badge-row">
            <button className="button button--ghost" onClick={closeHomeEditor} type="button">
              先看总览
            </button>
            <button
              className="button button--primary"
              onClick={openAdvancedHomeSettings}
              type="button"
            >
              去设置验证并继续
            </button>
          </div>
        </section>
      ) : null}
      <PageFrame
        aside={
          <HomeInsightRail
            devices={devices}
            onOpenCluster={(clusterKey) => {
              setSelectedHotspotId(null);
              setClimatePickerOpen(false);
              setSelectedHotspotModal(null);
              if (clusterKey === "climate") {
                handleOpenClimateEntry();
                return;
              }
              setSelectedCluster(clusterKey);
            }}
            onOpenFavoriteDevice={handleOpenFavoriteDevice}
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
          onLongPressHotspot={handleOpenHotspotGroup}
          onSelectHotspot={(hotspotId) => {
            setSelectedCluster(null);
            setClimatePickerOpen(false);
            setSelectedHotspotModal(null);
            setSelectedHotspotId(hotspotId);
          }}
          pendingHotspotIds={pendingHotspotIds}
          selectedHotspotId={selectedHotspotId}
        />
      </PageFrame>

      <HomeClusterControlModal
        cluster={selectedCluster}
        devices={devices}
        onClose={() => setSelectedCluster(null)}
        open={selectedCluster !== null}
      />
      <ClimateDevicePicker
        devices={climateDevices}
        onClose={() => setClimatePickerOpen(false)}
        onSelectDevice={openClimateDeviceDetail}
        open={climatePickerOpen}
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
