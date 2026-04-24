import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchDeviceDetail, fetchDevices, fetchRooms } from "../api/devicesApi";
import { normalizeApiError } from "../api/httpClient";
import { fetchSettings, saveSettings } from "../api/settingsApi";
import {
  DeviceControlSchemaItemDto,
  DeviceDetailDto,
  DeviceEntityLinkDto,
  DeviceListItemDto,
  RoomListItemDto,
  SettingsDto,
  SettingsSaveInput,
} from "../api/types";
import { appStore } from "../store/useAppStore";

type OfflineFilter = "ALL" | "ONLINE" | "OFFLINE";
type HomeEntryAction = "add" | "remove";
type HomeEntryFeedback = { tone: "success" | "error"; text: string } | null;

function getStatusLabel(device: DeviceListItemDto): string {
  if (device.is_offline) {
    return "离线";
  }
  return formatDeviceStatus(device.status);
}

function getStatusTone(device: DeviceListItemDto): "online" | "offline" {
  return device.is_offline ? "offline" : "online";
}

function getHomeEntryLabel(device: DeviceListItemDto): string {
  if (device.is_favorite) {
    return "已在首页";
  }
  if (device.is_favorite_candidate) {
    return "可加入首页";
  }
  return device.favorite_exclude_reason || "不可加入首页";
}

function formatDeviceStatus(value: string | null | undefined): string {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "unknown") {
    return "状态未知";
  }
  if (normalized === "online" || normalized === "active") {
    return "在线";
  }
  if (normalized === "offline" || normalized === "unavailable") {
    return "离线";
  }
  if (normalized === "smart") {
    return "智能";
  }
  return value ?? "状态未知";
}

function formatDeviceType(value: string | null | undefined): string {
  const normalized = (value ?? "").trim().toUpperCase();
  const labels: Record<string, string> = {
    CLIMATE: "温控",
    FRIDGE: "冰箱",
    LIGHT: "灯光",
    MEDIA: "媒体",
    POWER: "电源",
    SCALE: "体脂秤",
    SENSOR: "传感器",
    SWITCH: "开关",
  };
  return labels[normalized] ?? (value ? value : "未分类");
}

function formatDeviceTimestamp(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  const hour = String(parsed.getHours()).padStart(2, "0");
  const minute = String(parsed.getMinutes()).padStart(2, "0");
  return `${parsed.getMonth() + 1}月${parsed.getDate()}日 ${hour}:${minute}`;
}

function compactJson(value: unknown): string {
  if (value === null || value === undefined) {
    return "-";
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  return JSON.stringify(value, null, 2);
}

function getEntityLinks(detail: DeviceDetailDto): DeviceEntityLinkDto[] {
  const links = detail.source_info.entity_links;
  return Array.isArray(links) ? links : [];
}

function describeControlSchema(schema: DeviceControlSchemaItemDto) {
  const target = [schema.target_scope, schema.target_key]
    .filter(Boolean)
    .join(" / ");
  const value = schema.allowed_values?.length
    ? schema.allowed_values.join(", ")
    : schema.value_range
      ? compactJson(schema.value_range)
      : schema.value_type || "-";
  return { target: target || "-", value };
}

function normalizeFavorites(
  settings: SettingsDto,
): SettingsSaveInput["favorites"] {
  return (settings.favorites ?? []).map((favorite, index) => ({
    device_id: favorite.device_id,
    selected: favorite.selected ?? true,
    favorite_order:
      typeof favorite.favorite_order === "number"
        ? favorite.favorite_order
        : index,
  }));
}

function getNextFavoriteOrder(favorites: SettingsSaveInput["favorites"]) {
  const orders = favorites
    .map((favorite, index) =>
      typeof favorite.favorite_order === "number"
        ? favorite.favorite_order
        : index,
    )
    .filter((order) => Number.isFinite(order));
  return orders.length ? Math.max(...orders) + 1 : 0;
}

function buildSettingsSaveInput(
  settings: SettingsDto,
  favorites: SettingsSaveInput["favorites"],
): SettingsSaveInput {
  const pageSettings = settings.page_settings;
  const functionSettings = settings.function_settings;

  return {
    settings_version: settings.settings_version ?? null,
    page_settings: {
      room_label_mode: pageSettings?.room_label_mode ?? "ROOM_NAME",
      homepage_display_policy: pageSettings?.homepage_display_policy ?? {},
      icon_policy: pageSettings?.icon_policy ?? {},
      layout_preference: pageSettings?.layout_preference ?? {},
    },
    function_settings: {
      low_battery_threshold: functionSettings?.low_battery_threshold ?? 20,
      offline_threshold_seconds:
        functionSettings?.offline_threshold_seconds ?? 300,
      quick_entry_policy: functionSettings?.quick_entry_policy ?? {
        favorites: true,
      },
      music_enabled: functionSettings?.music_enabled ?? true,
      favorite_limit: functionSettings?.favorite_limit ?? 8,
      auto_home_timeout_seconds:
        functionSettings?.auto_home_timeout_seconds ?? 30,
      position_device_thresholds:
        functionSettings?.position_device_thresholds ?? {},
    },
    favorites,
  };
}

function buildNextFavorites(
  settings: SettingsDto,
  deviceId: string,
  action: HomeEntryAction,
) {
  const favorites = normalizeFavorites(settings).filter(
    (favorite) => favorite.device_id !== deviceId,
  );

  if (action === "remove") {
    return favorites;
  }

  return [
    ...favorites,
    {
      device_id: deviceId,
      selected: true,
      favorite_order: getNextFavoriteOrder(favorites),
    },
  ];
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
  const [selectedDevice, setSelectedDevice] = useState<DeviceDetailDto | null>(
    null,
  );
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [homeEntryBusyDeviceId, setHomeEntryBusyDeviceId] = useState<
    string | null
  >(null);
  const [homeEntryFeedback, setHomeEntryFeedback] =
    useState<HomeEntryFeedback>(null);

  async function loadCatalog(
    nextKeyword = keyword,
    nextRoomFilter = roomFilter,
  ) {
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

  async function openDeviceDetail(deviceId: string) {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const detail = await fetchDeviceDetail(deviceId);
      setSelectedDevice(detail);
    } catch (requestError) {
      setDetailError(normalizeApiError(requestError).message);
    } finally {
      setDetailLoading(false);
    }
  }

  async function updateHomeEntry(
    device: DeviceListItemDto,
    action: HomeEntryAction,
  ) {
    if (action === "add" && !device.is_favorite_candidate) {
      setHomeEntryFeedback({
        tone: "error",
        text: device.favorite_exclude_reason || "当前设备不可加入首页。",
      });
      return;
    }

    setHomeEntryBusyDeviceId(device.device_id);
    setHomeEntryFeedback(null);
    try {
      const settings = await fetchSettings();
      const favorites = normalizeFavorites(settings);
      const alreadySelected = favorites.some(
        (favorite) =>
          favorite.device_id === device.device_id && favorite.selected,
      );

      if (action === "add" && alreadySelected) {
        setHomeEntryFeedback({
          tone: "success",
          text: `${device.display_name} 已在首页，可到设置里调整排序。`,
        });
        return;
      }

      if (action === "remove" && !alreadySelected) {
        setHomeEntryFeedback({
          tone: "success",
          text: `${device.display_name} 当前不在首页。`,
        });
        return;
      }

      const nextFavorites = buildNextFavorites(
        settings,
        device.device_id,
        action,
      );
      await saveSettings(buildSettingsSaveInput(settings, nextFavorites));
      const refreshedSettings = await fetchSettings();
      appStore.setSettingsData(
        refreshedSettings as unknown as Record<string, unknown>,
      );
      await loadCatalog(keyword, roomFilter);
      setHomeEntryFeedback({
        tone: "success",
        text:
          action === "add"
            ? `${device.display_name} 已加入首页，可到设置里调整排序。`
            : `${device.display_name} 已移出首页。`,
      });
    } catch (requestError) {
      setHomeEntryFeedback({
        tone: "error",
        text: normalizeApiError(requestError).message,
      });
    } finally {
      setHomeEntryBusyDeviceId(null);
    }
  }

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
    const onlineCount = visibleDevices.filter(
      (device) => !device.is_offline,
    ).length;
    const offlineCount = visibleDevices.length - onlineCount;
    const readonlyCount = visibleDevices.filter(
      (device) => device.is_readonly_device,
    ).length;
    const homeEntryCount = visibleDevices.filter(
      (device) => device.is_favorite,
    ).length;
    return {
      onlineCount,
      offlineCount,
      readonlyCount,
      homeEntryCount,
    };
  }, [visibleDevices]);
  const selectedDeviceCatalog = useMemo(
    () =>
      selectedDevice
        ? (devices.find(
            (device) => device.device_id === selectedDevice.device_id,
          ) ?? null)
        : null,
    [devices, selectedDevice],
  );

  function renderHomeEntryAction(device: DeviceListItemDto) {
    const isBusy = homeEntryBusyDeviceId === device.device_id;

    if (device.is_favorite) {
      return (
        <button
          className="button button--ghost devices-table__action"
          disabled={isBusy}
          onClick={() => void updateHomeEntry(device, "remove")}
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
          onClick={() => void updateHomeEntry(device, "add")}
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
  }

  return (
    <section className="page page--devices">
      {error ? <p className="inline-error">{error}</p> : null}
      {homeEntryFeedback ? (
        <p
          className={
            homeEntryFeedback.tone === "error"
              ? "inline-error"
              : "inline-success"
          }
        >
          {homeEntryFeedback.text}
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
          <span className="state-chip">{`目录总数 ${totalFromServer}`}</span>
          <span className="state-chip">{`在线 ${stats.onlineCount}`}</span>
          <span className="state-chip">{`离线 ${stats.offlineCount}`}</span>
          <span className="state-chip">{`只读 ${stats.readonlyCount}`}</span>
          <span className="state-chip">{`已在首页 ${stats.homeEntryCount}`}</span>
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
              onChange={(event) =>
                setOfflineFilter(event.target.value as OfflineFilter)
              }
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
            <Link className="button button--ghost" to="/?edit=1">
              去总览编辑首页
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
          <div className="devices-catalog-list">
            {visibleDevices.map((device) => (
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
                    onClick={() => void openDeviceDetail(device.device_id)}
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
      {selectedDevice || detailLoading || detailError ? (
        <aside className="devices-detail-drawer" aria-label="设备详情">
          <div className="devices-detail-drawer__header">
            <div>
              <span className="card-eyebrow">设备详情</span>
              <h3>{selectedDevice?.display_name ?? "读取中"}</h3>
            </div>
            <button
              className="button button--ghost"
              onClick={() => {
                setSelectedDevice(null);
                setDetailError(null);
              }}
              type="button"
            >
              关闭
            </button>
          </div>
          {detailError ? <p className="inline-error">{detailError}</p> : null}
          {detailLoading ? (
            <p className="muted-copy">正在读取设备详情...</p>
          ) : null}
          {selectedDevice ? (
            <div className="devices-detail-drawer__body">
              {selectedDeviceCatalog ? (
                <section className="devices-home-entry-card">
                  <div>
                    <span className="card-eyebrow">首页入口</span>
                    <strong>{getHomeEntryLabel(selectedDeviceCatalog)}</strong>
                    <p className="muted-copy">
                      设备页负责加入或移出首页；排序和显示规则仍在设置里调整。
                    </p>
                  </div>
                  {renderHomeEntryAction(selectedDeviceCatalog)}
                </section>
              ) : null}
              <dl className="field-grid">
                <div>
                  <dt>设备 ID</dt>
                  <dd>{selectedDevice.device_id}</dd>
                </div>
                <div>
                  <dt>房间</dt>
                  <dd>{selectedDevice.room_name || "-"}</dd>
                </div>
                <div>
                  <dt>类型</dt>
                  <dd>{formatDeviceType(selectedDevice.device_type)}</dd>
                </div>
                <div>
                  <dt>运行状态</dt>
                  <dd>{formatDeviceStatus(selectedDevice.status)}</dd>
                </div>
                <div>
                  <dt>聚合状态</dt>
                  <dd>
                    {selectedDevice.runtime_state?.aggregated_state ?? "-"}
                  </dd>
                </div>
                <div>
                  <dt>最近更新</dt>
                  <dd>{formatDeviceTimestamp(selectedDevice.runtime_state?.last_state_update_at)}</dd>
                </div>
                <div>
                  <dt>户型图热点</dt>
                  <dd>
                    {selectedDevice.editor_config?.hotspots?.length
                      ? `${selectedDevice.editor_config.hotspots.length} 个`
                      : "未布点"}
                  </dd>
                </div>
              </dl>

              <section className="devices-detail-section">
                <h4>运行态</h4>
                <pre>
                  {compactJson(selectedDevice.runtime_state?.telemetry ?? {})}
                </pre>
              </section>

              <section className="devices-detail-section">
                <h4>control_schema</h4>
                {selectedDevice.control_schema.length ? (
                  <div className="devices-detail-list">
                    {selectedDevice.control_schema.map((schema, index) => {
                      const described = describeControlSchema(schema);
                      return (
                        <div
                          className="devices-detail-list__item"
                          key={`${schema.action_type}-${schema.target_scope}-${schema.target_key}-${index}`}
                        >
                          <strong>{schema.action_type}</strong>
                          <span>{`目标 ${described.target}`}</span>
                          <span>{`取值 ${described.value}${schema.unit ? ` ${schema.unit}` : ""}`}</span>
                          <span>
                            {schema.is_quick_action ? "快捷动作" : "详情动作"}
                            {schema.requires_detail_entry
                              ? " · 需要详情入口"
                              : ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="muted-copy">当前设备没有可用控制 schema。</p>
                )}
              </section>

              <section className="devices-detail-section">
                <h4>HA entity 映射</h4>
                {getEntityLinks(selectedDevice).length ? (
                  <div className="devices-detail-list">
                    {getEntityLinks(selectedDevice).map((entity) => (
                      <div
                        className="devices-detail-list__item"
                        key={entity.entity_id}
                      >
                        <strong>{entity.entity_id}</strong>
                        <span>{`${entity.domain || "-"} · ${entity.platform || "-"}`}</span>
                        <span>{`角色 ${entity.entity_role || "-"}${entity.is_primary ? " · 主实体" : ""}`}</span>
                        <span>{`状态 ${entity.state ?? "-"} · 可用 ${entity.is_available === false ? "否" : "是"}`}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted-copy">当前设备没有 HA entity 映射。</p>
                )}
              </section>

              <section className="devices-detail-section">
                <h4>来源信息</h4>
                <pre>{compactJson(selectedDevice.source_info)}</pre>
              </section>
            </div>
          ) : null}
        </aside>
      ) : null}
    </section>
  );
}
