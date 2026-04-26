import type { DeviceListItemDto, EditorDraftLayoutDto } from "../../api/types";
import {
  resequenceHotspots,
  stringifyLayoutMeta,
  type EditorDraftState,
} from "../../editor/editorDraftState";
import type { EditorHotspotViewModel } from "../../view-models/editor";
import { mapEditorViewModel } from "../../view-models/editor";

export interface EditorHistoryEntry {
  draft: EditorDraftState;
  selectedHotspotId: string | null;
}

export interface LightEditorSessionState {
  leaseId: string | null;
  draftVersion: string | null;
  baseLayoutVersion: string | null;
  leaseExpiresAt: string | null;
  heartbeatIntervalSeconds: number | null;
  lockStatus: string | null;
}

export interface EditorNoticeState {
  tone: "success" | "warning" | "error";
  title: string;
  detail: string;
}

export function clampPosition(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

export function buildDeviceHotspotId(deviceId: string) {
  const normalized = deviceId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48);
  return `home-hotspot-${normalized}-${Date.now()}`;
}

export function getNextHotspotPosition(index: number) {
  const column = index % 4;
  const row = Math.floor(index / 4);
  return {
    x: Math.min(0.18 + column * 0.18, 0.82),
    y: Math.min(0.24 + row * 0.14, 0.84),
  };
}

export function createNewHotspot(index: number): EditorHotspotViewModel {
  const nextPosition = getNextHotspotPosition(index);
  return {
    id: `home-hotspot-manual-${Date.now()}`,
    label: `新热点 ${index + 1}`,
    deviceId: "",
    x: nextPosition.x,
    y: nextPosition.y,
    iconType: "device",
    iconAssetId: null,
    iconAssetUrl: null,
    labelMode: "AUTO",
    isVisible: true,
    structureOrder: index,
  };
}

export function createDeviceHotspot(
  device: DeviceListItemDto,
  index: number,
): EditorHotspotViewModel {
  const nextPosition = getNextHotspotPosition(index);
  return {
    id: buildDeviceHotspotId(device.device_id),
    label: device.display_name,
    deviceId: device.device_id,
    x: nextPosition.x,
    y: nextPosition.y,
    iconType: "device",
    iconAssetId: null,
    iconAssetUrl: null,
    labelMode: "AUTO",
    isVisible: true,
    structureOrder: index,
  };
}

export function isConflictErrorCode(code: string) {
  return (
    code === "VERSION_CONFLICT" ||
    code === "DRAFT_LOCK_LOST" ||
    code === "DRAFT_LOCK_TAKEN_OVER"
  );
}

export function buildPlacedDeviceIds(hotspots: EditorHotspotViewModel[]) {
  return new Set(
    hotspots
      .map((hotspot) => hotspot.deviceId.trim())
      .filter((deviceId) => deviceId.length > 0),
  );
}

export function filterUnplacedDevices(
  devices: DeviceListItemDto[],
  placedDeviceIds: Set<string>,
  search: string,
) {
  const keyword = search.trim().toLowerCase();
  return devices
    .filter((device) => !placedDeviceIds.has(device.device_id))
    .filter((device) => {
      if (!keyword) {
        return true;
      }
      const source =
        `${device.display_name} ${device.room_name ?? ""} ${device.device_id}`.toLowerCase();
      return source.includes(keyword);
    })
    .slice(0, 8);
}

export function draftResponseToStageState(
  draft: {
    lock_status: string | null;
    layout: EditorDraftLayoutDto | null;
    draft_version: string | null;
    base_layout_version: string | null;
    readonly: boolean;
  },
  session: LightEditorSessionState,
  pinActive: boolean,
) {
  const viewModel = mapEditorViewModel({
    lockStatus: draft.lock_status,
    leaseId: session.leaseId,
    leaseExpiresAt: session.leaseExpiresAt,
    heartbeatIntervalSeconds: session.heartbeatIntervalSeconds,
    lockedByTerminalId: null,
    draft: draft.layout ?? null,
    draftVersion: draft.draft_version,
    baseLayoutVersion: draft.base_layout_version,
    readonly: draft.readonly,
    pinActive,
    events: [],
  });

  return {
    backgroundAssetId: viewModel.backgroundAssetId,
    backgroundImageUrl: viewModel.backgroundImageUrl,
    backgroundImageSize: viewModel.backgroundImageSize,
    layoutMetaText: stringifyLayoutMeta(viewModel.layoutMeta),
    hotspots: resequenceHotspots(viewModel.hotspots),
  };
}
