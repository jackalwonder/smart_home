import { apiRequest } from "./httpClient";
import { DeviceDetailDto, DeviceListDto, RoomListDto } from "./types";

interface FetchDevicesParams {
  room_id?: string;
  keyword?: string;
  page?: number;
  page_size?: number;
}

function buildQuery(params: FetchDevicesParams): string {
  const query = new URLSearchParams();
  if (params.room_id) {
    query.set("room_id", params.room_id);
  }
  if (params.keyword) {
    query.set("keyword", params.keyword);
  }
  if (typeof params.page === "number") {
    query.set("page", String(params.page));
  }
  if (typeof params.page_size === "number") {
    query.set("page_size", String(params.page_size));
  }
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

export function fetchDevices(params: FetchDevicesParams = {}) {
  return apiRequest<DeviceListDto>(`/api/v1/devices${buildQuery(params)}`);
}

export function fetchDeviceDetail(deviceId: string) {
  const query = new URLSearchParams({
    include_runtime_fields: "true",
    include_editor_fields: "true",
  });
  return apiRequest<DeviceDetailDto>(
    `/api/v1/devices/${encodeURIComponent(deviceId)}?${query.toString()}`,
  );
}

export function fetchRooms() {
  return apiRequest<RoomListDto>("/api/v1/rooms");
}
