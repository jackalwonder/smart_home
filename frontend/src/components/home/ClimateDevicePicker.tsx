import type { DeviceListItemDto } from "../../api/types";
import { formatClimateDeviceType, formatDeviceControlBadge } from "./homeClimateDevices";

interface ClimateDevicePickerProps {
  devices: DeviceListItemDto[];
  onClose: () => void;
  onSelectDevice: (device: DeviceListItemDto) => void;
  open: boolean;
}

export function ClimateDevicePicker({
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
                    {device.room_name ?? "未分配房间"} ·{" "}
                    {formatClimateDeviceType(device.device_type)}
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
