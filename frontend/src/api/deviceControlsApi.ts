import { apiRequest } from "./httpClient";
import {
  DeviceControlAcceptedDto,
  DeviceControlRequestInput,
  DeviceControlResultDto,
} from "./types";

export function acceptDeviceControl(input: DeviceControlRequestInput) {
  return apiRequest<DeviceControlAcceptedDto>("/api/v1/device-controls", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function fetchDeviceControlResult(requestId: string) {
  return apiRequest<DeviceControlResultDto>(
    `/api/v1/device-controls/${encodeURIComponent(requestId)}`,
  );
}
