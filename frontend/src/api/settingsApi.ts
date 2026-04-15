import { apiRequest } from "./httpClient";
import { SettingsDto, SettingsSaveDto, SettingsSaveInput } from "./types";

export function fetchSettings() {
  return apiRequest<SettingsDto>("/api/v1/settings");
}

export function saveSettings(input: SettingsSaveInput) {
  return apiRequest<SettingsSaveDto>("/api/v1/settings", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
