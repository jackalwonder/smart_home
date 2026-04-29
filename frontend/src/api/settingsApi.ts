import { getAccessToken } from "../auth/accessToken";
import { API_BASE_URL, apiRequest } from "./httpClient";
import {
  SettingsDto,
  SettingsSaveDto,
  SettingsSaveInput,
  SgccEnergyPullDto,
  SgccLoginQrCodeStatusDto,
} from "./types";

export function fetchSettings() {
  return apiRequest<SettingsDto>("/api/v1/settings");
}

export function saveSettings(input: SettingsSaveInput) {
  return apiRequest<SettingsSaveDto>("/api/v1/settings", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function fetchSgccLoginQrCodeStatus() {
  return apiRequest<SgccLoginQrCodeStatusDto>("/api/v1/settings/sgcc-login-qrcode");
}

export function regenerateSgccLoginQrCode() {
  return apiRequest<SgccLoginQrCodeStatusDto>(
    "/api/v1/settings/sgcc-login-qrcode/regenerate",
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export function bindSgccEnergyAccount() {
  return apiRequest<SgccLoginQrCodeStatusDto>(
    "/api/v1/settings/sgcc-login-qrcode/bind-energy-account",
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export function pullSgccEnergyData() {
  return apiRequest<SgccEnergyPullDto>(
    "/api/v1/settings/sgcc-login-qrcode/pull-energy-data",
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export async function fetchSgccLoginQrCodeImage(pathOrUrl: string) {
  const url = new URL(pathOrUrl, API_BASE_URL);
  const accessToken = getAccessToken();
  const headers = new Headers();
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(url.toString(), {
    credentials: "include",
    headers,
  });
  if (!response.ok) {
    throw new Error("Failed to fetch SGCC login QR code image.");
  }

  return response.blob();
}
