import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchDeviceDetail, fetchDevices, fetchRooms } from "../api/devicesApi";
import { normalizeApiError } from "../api/httpClient";
import {
  DeviceDetailDto,
  DeviceListItemDto,
  RoomListItemDto,
} from "../api/types";
import {
  buildCatalogStats,
  filterDevicesByOfflineStatus,
  OfflineFilter,
} from "./devicesCatalogModel";

export function useDevicesCatalog() {
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

  const loadCatalog = useCallback(
    async (nextKeyword: string, nextRoomFilter: string) => {
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
    },
    [],
  );

  useEffect(() => {
    void loadCatalog("", "");
  }, [loadCatalog]);

  const openDeviceDetail = useCallback(async (deviceId: string) => {
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
  }, []);

  const closeDeviceDetail = useCallback(() => {
    setSelectedDevice(null);
    setDetailError(null);
  }, []);

  const runSearch = useCallback(() => {
    const nextKeyword = keywordInput.trim();
    setKeyword(nextKeyword);
    void loadCatalog(nextKeyword, roomFilter);
  }, [keywordInput, loadCatalog, roomFilter]);

  const resetFilters = useCallback(() => {
    setKeywordInput("");
    setKeyword("");
    setRoomFilter("");
    setOfflineFilter("ALL");
    void loadCatalog("", "");
  }, [loadCatalog]);

  const refreshCatalog = useCallback(() => {
    void loadCatalog(keyword, roomFilter);
  }, [keyword, loadCatalog, roomFilter]);

  const visibleDevices = useMemo(
    () => filterDevicesByOfflineStatus(devices, offlineFilter),
    [devices, offlineFilter],
  );

  const stats = useMemo(() => buildCatalogStats(visibleDevices), [visibleDevices]);

  const selectedDeviceCatalog = useMemo(
    () =>
      selectedDevice
        ? (devices.find(
            (device) => device.device_id === selectedDevice.device_id,
          ) ?? null)
        : null,
    [devices, selectedDevice],
  );

  return {
    rooms,
    devices,
    visibleDevices,
    keywordInput,
    setKeywordInput,
    keyword,
    roomFilter,
    setRoomFilter,
    offlineFilter,
    setOfflineFilter,
    loading,
    error,
    lastLoadedAt,
    totalFromServer,
    selectedDevice,
    selectedDeviceCatalog,
    detailLoading,
    detailError,
    stats,
    loadCatalog,
    openDeviceDetail,
    closeDeviceDetail,
    runSearch,
    resetFilters,
    refreshCatalog,
  };
}
