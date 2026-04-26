import { useCallback } from "react";
import { Link } from "react-router-dom";
import { DeviceCatalogDetailPanel } from "./DeviceCatalogDetailPanel";
import { DeviceCatalogList } from "./DeviceCatalogList";
import { HomeEntryAction, OfflineFilter } from "./devicesCatalogModel";
import { useDeviceHomeEntry } from "./useDeviceHomeEntry";
import { useDevicesCatalog } from "./useDevicesCatalog";

export function DevicesCatalogPage() {
  const catalog = useDevicesCatalog();
  const homeEntry = useDeviceHomeEntry({
    onCatalogChanged: () => catalog.loadCatalog(catalog.keyword, catalog.roomFilter),
  });
  type DeviceListItem = Parameters<typeof homeEntry.updateHomeEntry>[0];

  const renderHomeEntryAction = useCallback(
    (device: DeviceListItem) => {
      const isBusy = homeEntry.homeEntryBusyDeviceId === device.device_id;

      if (device.is_favorite) {
        return (
          <button
            className="button button--ghost devices-table__action"
            disabled={isBusy}
            onClick={() =>
              void homeEntry.updateHomeEntry(device, "remove" satisfies HomeEntryAction)
            }
            type="button"
          >
            {isBusy ? "处理中..." : "移出首页"}
          </button>
        );
      }

      if (device.is_favorite_candidate) {
        return (
          <button
            className="button button--primary devices-table__action"
            disabled={isBusy}
            onClick={() =>
              void homeEntry.updateHomeEntry(device, "add" satisfies HomeEntryAction)
            }
            type="button"
          >
            {isBusy ? "处理中..." : "加入首页"}
          </button>
        );
      }

      return (
        <button
          className="button button--ghost devices-table__action"
          disabled
          title={device.favorite_exclude_reason || "当前设备不可加入首页"}
          type="button"
        >
          不可加入
        </button>
      );
    },
    [homeEntry],
  );

  return (
    <section className="page page--devices">
      {catalog.error ? <p className="inline-error">{catalog.error}</p> : null}
      {homeEntry.homeEntryFeedback ? (
        <p
          className={
            homeEntry.homeEntryFeedback.tone === "error" ? "inline-error" : "inline-success"
          }
        >
          {homeEntry.homeEntryFeedback.text}
        </p>
      ) : null}

      <header className="panel devices-header">
        <div className="devices-header__copy">
          <span className="card-eyebrow">设备中心</span>
          <h2>设备浏览与加入首页</h2>
          <p className="muted-copy">
            这里用于查找设备、查看状态并确认是否可加入首页；排序和显示规则在设置的首页入口管理中处理。
          </p>
        </div>
        <div className="badge-row">
          <span className="state-chip">{`目录总数 ${catalog.totalFromServer}`}</span>
          <span className="state-chip">{`在线 ${catalog.stats.onlineCount}`}</span>
          <span className="state-chip">{`离线 ${catalog.stats.offlineCount}`}</span>
          <span className="state-chip">{`只读 ${catalog.stats.readonlyCount}`}</span>
          <span className="state-chip">{`已在首页 ${catalog.stats.homeEntryCount}`}</span>
        </div>
        <div className="devices-header__controls">
          <label className="form-field">
            <span>关键词</span>
            <input
              className="control-input"
              onChange={(event) => catalog.setKeywordInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  catalog.runSearch();
                }
              }}
              placeholder="设备名 / 原始名"
              value={catalog.keywordInput}
            />
          </label>
          <label className="form-field">
            <span>房间</span>
            <select
              className="control-input"
              onChange={(event) => catalog.setRoomFilter(event.target.value)}
              value={catalog.roomFilter}
            >
              <option value="">全部房间</option>
              {catalog.rooms.map((room) => (
                <option key={room.room_id} value={room.room_id}>
                  {room.room_name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>在线筛选</span>
            <select
              className="control-input"
              onChange={(event) =>
                catalog.setOfflineFilter(event.target.value as OfflineFilter)
              }
              value={catalog.offlineFilter}
            >
              <option value="ALL">全部</option>
              <option value="ONLINE">仅在线</option>
              <option value="OFFLINE">仅离线</option>
            </select>
          </label>
          <div className="devices-header__actions">
            <button className="button button--ghost" onClick={catalog.runSearch} type="button">
              查询目录
            </button>
            <button
              className="button button--ghost"
              onClick={catalog.resetFilters}
              type="button"
            >
              清空筛选
            </button>
            <button
              className="button button--primary"
              onClick={catalog.refreshCatalog}
              type="button"
            >
              刷新目录
            </button>
            <Link className="button button--ghost" to="/?edit=1">
              去总览编辑首页
            </Link>
          </div>
        </div>
      </header>

      <DeviceCatalogList
        devices={catalog.visibleDevices}
        lastLoadedAt={catalog.lastLoadedAt}
        loading={catalog.loading}
        onOpenDetail={(deviceId) => void catalog.openDeviceDetail(deviceId)}
        renderHomeEntryAction={renderHomeEntryAction}
      />
      <DeviceCatalogDetailPanel
        detailError={catalog.detailError}
        detailLoading={catalog.detailLoading}
        onClose={catalog.closeDeviceDetail}
        renderHomeEntryAction={renderHomeEntryAction}
        selectedDevice={catalog.selectedDevice}
        selectedDeviceCatalog={catalog.selectedDeviceCatalog}
      />
    </section>
  );
}
