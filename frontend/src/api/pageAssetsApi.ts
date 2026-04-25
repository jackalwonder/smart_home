import { getRequestContext } from "../config/requestContext";
import { apiRequest, API_BASE_URL } from "./httpClient";
import { FloorplanAssetDto, HotspotIconAssetDto } from "./types";

function withRequestContext(pathOrUrl: string) {
  const url = new URL(pathOrUrl, API_BASE_URL);
  const { homeId, terminalId } = getRequestContext();
  url.searchParams.set("home_id", homeId);
  url.searchParams.set("terminal_id", terminalId);
  return url.toString();
}

export function resolveAssetImageUrl(value: string | null | undefined) {
  const source = value?.trim();
  if (!source) {
    return null;
  }

  if (source.startsWith("/api/")) {
    return withRequestContext(source);
  }

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(source)) {
    return withRequestContext(`/api/v1/page-assets/floorplan/${source}/file`);
  }

  if (
    source.startsWith("http://") ||
    source.startsWith("https://") ||
    source.startsWith("data:") ||
    source.startsWith("blob:")
  ) {
    return source;
  }

  return source;
}

export function uploadFloorplanAsset(input: { file: File; replaceCurrent?: boolean }) {
  const formData = new FormData();
  formData.set("file", input.file);
  formData.set("replace_current", String(input.replaceCurrent ?? false));

  return apiRequest<FloorplanAssetDto>("/api/v1/page-assets/floorplan", {
    method: "POST",
    body: formData,
  });
}

export function resolveHotspotIconUrl(value: string | null | undefined) {
  const source = value?.trim();
  if (!source) {
    return null;
  }

  if (source.startsWith("/api/")) {
    return withRequestContext(source);
  }

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(source)) {
    return withRequestContext(`/api/v1/page-assets/hotspot-icons/${source}/file`);
  }

  if (
    source.startsWith("http://") ||
    source.startsWith("https://") ||
    source.startsWith("data:") ||
    source.startsWith("blob:")
  ) {
    return source;
  }

  return source;
}

export function uploadHotspotIconAsset(input: { file: File }) {
  const formData = new FormData();
  formData.set("file", input.file);

  return apiRequest<HotspotIconAssetDto>("/api/v1/page-assets/hotspot-icons", {
    method: "POST",
    body: formData,
  });
}
