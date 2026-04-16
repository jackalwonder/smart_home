import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchDevices, fetchRooms } from "../api/devicesApi";
import { normalizeApiError } from "../api/httpClient";
import { DeviceListItemDto, RoomListItemDto } from "../api/types";

type OfflineFilter = "ALL" | "ONLINE" | "OFFLINE";

function getStatusLabel(device: DeviceListItemDto): string {
  if (device.is_offline) {
    return "离线";
  }
  return device.status || "UNKNOWN";
}

function getStatusTone(device: DeviceListItemDto): "online" | "offline" {
  return device.is_offline ? "offline" : "online";
}

export function DevicesCatalogPage() {
  const [rooms, setRooms] = useState<RoomListItemDto[]>([]);
  const [devices, setDevices] = useState<DeviceListItemDto[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [roomFilter, setRoomFilter] = useState("");
  const [offlineFilter, setOfflineFilter] = useState<OfflineFilter>("ALL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);
  const [totalFromServer, setTotalFromServer] = useState(0);

  async function loadCatalog(nextKeyword = keyword, nextRoomFilter = roomFilter) {
    setLoading(true);
    setError(null);
    try {
      const [roomsResponse, devicesResponse] = await Promise.all([
        fetchRooms(),
        fetchDevices({
          room_id: nextRoomFilter || undefined,
          keyword: nextKeyword || undefined,
          page: 1,
          page_size: 200,
        }),
      ]);
      setRooms(roomsResponse.rooms);
      setDevices(devicesResponse.items);
      setTotalFromServer(devicesResponse.page_info.total);
      setLastLoadedAt(new Date().toLocaleString("zh-CN", { hour12: false }));
    } catch (requestError) {
      setError(normalizeApiError(requestError).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleDevices = useMemo(() => {
    if (offlineFilter === "ONLINE") {
      return devices.filter((device) => !device.is_offline);
    }
    if (offlineFilter === "OFFLINE") {
      return devices.filter((device) => device.is_offline);
    }
    return devices;
  }, [devices, offlineFilter]);

  const stats = useMemo(() => {
    const onlineCount = visibleDevices.filter((device) => !device.is_offline).length;
    const offlineCount = visibleDevices.length - onlineCount;
    const readonlyCount = visibleDevices.filter((device) => device.is_readonly_device).length;
    return {
      onlineCount,
      offlineCount,
      readonlyCount,
    };
  }, [visibleDevices]);

  return (
    <section className="page page--devices">
      {error ? <p className="inline-error">{error}</p> : null}

      <header className="panel devices-header">
        <div className="devices-header__copy">
          <span className="card-eyebrow">设备目录</span>
          <h2>设备池</h2>
          <p className="muted-copy">
            这里展示 Home Assistant 同步到后端后的当前设备结果。
          </p>
        </div>
        <div className="badge-row">
          <span className="state-chip">{`目录总数 ${totalFromServer}`}</span>
          <span className="state-chip">{`在线 ${stats.onlineCount}`}</span>
          <span className="state-chip">{`离线 ${stats.offlineCount}`}</span>
          <span className="state-chip">{`只读 ${stats.readonlyCount}`}</span>
        </div>
        <div className="devices-header__controls">
          <label className="form-field">
            <span>关键词</span>
            <input
              className="control-input"
              onChange={(event) => setKeywordInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setKeyword(keywordInput.trim());
                  void loadCatalog(keywordInput.trim(), roomFilter);
                }
              }}
              placeholder="设备名 / 原始名"
              value={keywordInput}
            />
          </label>
          <label className="form-field">
            <span>房间</span>
            <select
              className="control-input"
              onChange={(event) => setRoomFilter(event.target.value)}
              value={roomFilter}
            >
              <option value="">全部房间</option>
              {rooms.map((room) => (
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
              onChange={(event) => setOfflineFilter(event.target.value as OfflineFilter)}
              value={offlineFilter}
            >
              <option value="ALL">全部</option>
              <option value="ONLINE">仅在线</option>
              <option value="OFFLINE">仅离线</option>
            </select>
          </label>
          <div className="devices-header__actions">
            <button
              className="button button--ghost"
              onClick={() => {
                const nextKeyword = keywordInput.trim();
                setKeyword(nextKeyword);
                void loadCatalog(nextKeyword, roomFilter);
              }}
              type="button"
            >
              查询目录
            </button>
            <button
              className="button button--ghost"
              onClick={() => {
                setKeywordInput("");
                setKeyword("");
                setRoomFilter("");
                setOfflineFilter("ALL");
                void loadCatalog("", "");
              }}
              type="button"
            >
              清空筛选
            </button>
          <button
            className="button button--primary"
            onClick={() => void loadCatalog(keyword, roomFilter)}
            type="button"
          >
            刷新目录
          </button>
          <Link className="button button--ghost" to="/editor">
            去编辑器布点
          </Link>
        </div>
      </div>
    </header>

      <section className="panel devices-table-panel">
        <div className="devices-table-panel__meta">
          <strong>目录明细</strong>
          <span className="muted-copy">
            {loading
              ? "加载中..."
              : `当前显示 ${visibleDevices.length} 条${lastLoadedAt ? ` · 最近加载 ${lastLoadedAt}` : ""}`}
          </span>
        </div>

        {loading ? (
          <p className="muted-copy">正在从后端读取设备目录...</p>
        ) : visibleDevices.length ? (
          <div className="devices-table-wrapper">
            <table className="devices-table">
              <thead>
                <tr>
                  <th>设备</th>
                  <th>设备 ID</th>
                  <th>房间</th>
                  <th>类型</th>
                  <th>状态</th>
                  <th>收藏候选</th>
                </tr>
              </thead>
              <tbody>
                {visibleDevices.map((device) => (
                  <tr key={device.device_id}>
                    <td>
                      <div className="devices-table__device-cell">
                        <strong>{device.display_name}</strong>
                        <small>{device.raw_name || "-"}</small>
                      </div>
                    </td>
                    <td className="devices-table__mono">{device.device_id}</td>
                    <td>{device.room_name || "-"}</td>
                    <td>{device.device_type}</td>
                    <td>
                      <span className={`devices-status-chip is-${getStatusTone(device)}`}>
                        {getStatusLabel(device)}
                      </span>
                    </td>
                    <td>
                      {device.is_favorite_candidate
                        ? "可加入"
                        : device.favorite_exclude_reason || "不可加入"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted-copy">当前筛选条件下没有设备。</p>
        )}
      </section>
    </section>
  );
}
