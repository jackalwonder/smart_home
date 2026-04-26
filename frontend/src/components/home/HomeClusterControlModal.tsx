import { useMemo } from "react";
import {
  HomeClusterDevice,
  HomeClusterKey,
  clusterEyebrow,
  clusterIcon,
  filterClusterDevices,
  isBrightnessSchema,
  isPowerSchema,
  isTemperatureSchema,
  modalSubtitle,
  modalTitle,
} from "./homeClusterControlModel";
import { ClusterDeviceCard } from "./ClusterDeviceCard";
import { useDeviceControlFlow } from "./useDeviceControlFlow";

export type { HomeClusterKey } from "./homeClusterControlModel";

interface HomeClusterControlModalProps {
  open: boolean;
  cluster: HomeClusterKey | null;
  devices: HomeClusterDevice[];
  onClose: () => void;
}

export function HomeClusterControlModal({
  open,
  cluster,
  devices,
  onClose,
}: HomeClusterControlModalProps) {
  const filteredDevices = useMemo(() => {
    return filterClusterDevices(cluster, devices);
  }, [cluster, devices]);
  const controlTargetDevices =
    cluster === "battery" || cluster === "offline"
      ? filteredDevices
      : filteredDevices.slice(0, 8);
  const control = useDeviceControlFlow({
    deviceIds: controlTargetDevices.map((device) => device.device_id),
    enabled: open && Boolean(cluster),
    requestPrefix: "cluster",
  });

  if (!open || !cluster) {
    return null;
  }

  const onlineCount = filteredDevices.filter((device) => !device.is_offline).length;
  const controllableCount = control.details.filter(
    (detail) =>
      detail.control_schema.some(isPowerSchema) ||
      detail.control_schema.some(isTemperatureSchema) ||
      detail.control_schema.some(isBrightnessSchema),
  ).length;
  const compactPanel = filteredDevices.length <= 2;

  return (
    <div className="home-cluster-modal" role="dialog" aria-modal="true">
      <div className="home-cluster-modal__backdrop" onClick={onClose} aria-hidden="true" />
      <section
        className={`home-cluster-modal__panel is-${cluster}${compactPanel ? " is-compact" : ""}`}
      >
        <header className="home-cluster-modal__header">
          <div className="home-cluster-modal__title-row">
            <span className="home-cluster-modal__glyph" aria-hidden="true">
              {clusterIcon(cluster)}
            </span>
            <div>
              <span className="card-eyebrow">{clusterEyebrow(cluster)}</span>
              <h3>{modalTitle(cluster)}</h3>
              <p>{modalSubtitle(cluster)}</p>
            </div>
          </div>
          <div className="home-cluster-modal__header-meta">
            <span>{filteredDevices.length} 个设备</span>
            <span>{onlineCount} 个在线</span>
            {cluster === "lights" || cluster === "climate" ? (
              <span>{control.loading ? "读取中" : `${controllableCount} 个可控`}</span>
            ) : null}
          </div>
          <button
            aria-label="关闭弹层"
            className="home-cluster-modal__close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        {control.error ? <p className="inline-error">{control.error}</p> : null}
        {control.loading ? <p className="muted-copy">正在读取设备控制能力…</p> : null}
        {!control.loading && !filteredDevices.length ? (
          <div className="home-cluster-modal__empty">
            <strong>当前没有匹配设备</strong>
            <p>等你把更多设备接入或加入首页后，这里会更像一套完整中控。</p>
          </div>
        ) : null}

        <div className="home-cluster-modal__grid">
          {(control.details.length ? control.details : filteredDevices).map((item) => (
            <ClusterDeviceCard
              cluster={cluster}
              control={control}
              item={item}
              key={item.device_id}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
