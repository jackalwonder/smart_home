import { ReactNode } from "react";
import { DeviceListItemDto } from "../api/types";
import {
  formatDeviceType,
  getHomeEntryLabel,
  getStatusLabel,
  getStatusTone,
} from "./devicesCatalogModel";

interface DeviceCatalogListProps {
  devices: DeviceListItemDto[];
  loading: boolean;
  lastLoadedAt: string | null;
  onOpenDetail: (deviceId: string) => void;
  renderHomeEntryAction: (device: DeviceListItemDto) => ReactNode;
}

export function DeviceCatalogList({
  devices,
  loading,
  lastLoadedAt,
  onOpenDetail,
  renderHomeEntryAction,
}: DeviceCatalogListProps) {
  return (
    <section className="panel devices-table-panel">
      <div className="devices-table-panel__meta">
        <strong>目录明细</strong>
        <span className="muted-copy">
          {loading
            ? "加载中..."
            : `当前显示 ${devices.length} 条${lastLoadedAt ? ` · 最近加载 ${lastLoadedAt}` : ""}`}
        </span>
      </div>

      {loading ? (
        <p className="muted-copy">正在从后端读取设备目录...</p>
      ) : devices.length ? (
        <div className="devices-catalog-list">
          {devices.map((device) => (
            <article className="devices-catalog-card" key={device.device_id}>
              <div className="devices-catalog-card__icon" aria-hidden="true">
                {formatDeviceType(device.device_type).slice(0, 1)}
              </div>
              <div className="devices-catalog-card__main">
                <div className="devices-catalog-card__title">
                  <strong>{device.display_name}</strong>
                  <span>{device.room_name || "未分配房间"}</span>
                </div>
                <div className="devices-catalog-card__meta">
                  <span>{formatDeviceType(device.device_type)}</span>
                  <span>{device.raw_name || "无原始名称"}</span>
                </div>
              </div>
              <div className="devices-catalog-card__status">
                <span className={`devices-status-chip is-${getStatusTone(device)}`}>
                  {getStatusLabel(device)}
                </span>
                <small>{getHomeEntryLabel(device)}</small>
              </div>
              <div className="devices-table__action-group devices-catalog-card__actions">
                {renderHomeEntryAction(device)}
                <button
                  className="button button--ghost devices-table__action"
                  onClick={() => onOpenDetail(device.device_id)}
                  type="button"
                >
                  详情
                </button>
              </div>
              <details className="devices-catalog-card__technical">
                <summary>技术信息</summary>
                <span className="devices-table__mono">{device.device_id}</span>
              </details>
            </article>
          ))}
        </div>
      ) : (
        <p className="muted-copy">当前筛选条件下没有设备。</p>
      )}
    </section>
  );
}
