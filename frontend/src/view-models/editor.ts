import { formatRealtimeEvent } from "../ws/eventPresentation";
import { WsEvent } from "../ws/types";
import { resolveHotspotIconUrl } from "../api/pageAssetsApi";
import type { EditorDraftLayoutDto, JsonObject } from "../api/types";
import { asArray, asNumber, asOptionalString, asRecord, asString } from "./utils";
import { type ImageSize } from "../types/image";

export interface EditorHotspotViewModel {
  id: string;
  label: string;
  deviceId: string;
  x: number;
  y: number;
  iconType: string;
  iconAssetId: string | null;
  iconAssetUrl: string | null;
  labelMode: string;
  isVisible: boolean;
  structureOrder: number;
}

export interface EditorViewModel {
  commandRows: Array<{ label: string; value: string }>;
  hotspots: EditorHotspotViewModel[];
  backgroundAssetId: string | null;
  backgroundImageUrl: string | null;
  backgroundImageSize: ImageSize | null;
  layoutMeta: JsonObject;
  modeLabel: string;
  helperText: string;
  eventRows: Array<{ id: string; title: string; subtitle: string }>;
}

function parseImageSize(value: unknown): ImageSize | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const width = asNumber(record.width, 0);
  const height = asNumber(record.height, 0);
  if (width <= 0 || height <= 0) {
    return null;
  }

  return { width, height };
}

function asJsonObject(value: unknown): JsonObject | null {
  const record = asRecord(value);
  return record ? (record as JsonObject) : null;
}

function translateLockStatus(value: string | null) {
  if (value === "GRANTED") {
    return "已持有租约";
  }
  if (value === "LOCKED_BY_OTHER") {
    return "被其他终端占用";
  }
  if (value === "READ_ONLY") {
    return "只读";
  }
  return value ?? "-";
}

function formatLeaseExpiry(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function formatHeartbeatInterval(value: number | null) {
  return value ? `${value} 秒` : "-";
}

export function mapEditorViewModel(input: {
  lockStatus: string | null;
  leaseId: string | null;
  leaseExpiresAt: string | null;
  heartbeatIntervalSeconds: number | null;
  lockedByTerminalId: string | null;
  draft: EditorDraftLayoutDto | null;
  draftVersion: string | null;
  baseLayoutVersion: string | null;
  readonly: boolean;
  pinActive: boolean;
  events: WsEvent[];
}): EditorViewModel {
  const draft = input.draft;
  const hotspots = asArray<NonNullable<EditorDraftLayoutDto["hotspots"]>[number]>(
    draft?.hotspots,
  )
    .map((hotspot, index) => {
      const legacyEntityId = asOptionalString((hotspot as { entity_id?: unknown }).entity_id);
      return {
        id: asString(hotspot.hotspot_id ?? `draft-hotspot-${index}`),
        label: asString(
          hotspot.display_name ??
            hotspot.device_id ??
            legacyEntityId ??
            `Hotspot ${index + 1}`,
        ),
        deviceId: asString(hotspot.device_id ?? legacyEntityId ?? ""),
        x: asNumber(hotspot.x),
        y: asNumber(hotspot.y),
        iconType: asString(hotspot.icon_type ?? "device"),
        iconAssetId: asOptionalString(hotspot.icon_asset_id),
        iconAssetUrl: resolveHotspotIconUrl(
          asOptionalString(hotspot.icon_asset_url) ?? asOptionalString(hotspot.icon_asset_id),
        ),
        labelMode: asString(hotspot.label_mode ?? "AUTO"),
        isVisible: hotspot.is_visible !== false,
        structureOrder: asNumber(hotspot.structure_order, index),
      };
    })
    .sort((left, right) => left.structureOrder - right.structureOrder);

  let modeLabel = "只读预览";
  let helperText = "请先验证管理 PIN，再申请可写的编辑租约。";

  if (input.lockStatus === "GRANTED") {
    modeLabel = "租约已获取";
    helperText = "当前终端已持有草稿租约，可以继续编辑并在确认后发布。";
  } else if (input.lockStatus === "LOCKED_BY_OTHER") {
    modeLabel = "被其他终端占用";
    helperText = input.lockedByTerminalId
      ? `当前草稿被终端 ${input.lockedByTerminalId} 占用，你可以先查看，再决定是否接管。`
      : "当前草稿被其他终端占用，你可以先查看，再决定是否接管。";
  } else if (input.pinActive) {
    helperText =
      input.lockStatus === "READ_ONLY"
        ? "当前是只读快照。你可以重新申请编辑租约，或先刷新草稿确认最新状态。"
        : "PIN 已验证，编辑器正在等待可写租约。";
  }

  return {
    commandRows: [
      { label: "锁状态", value: translateLockStatus(input.lockStatus) },
      { label: "租约 ID", value: asString(input.leaseId ?? "-") },
      { label: "占用终端", value: asString(input.lockedByTerminalId ?? "-") },
      { label: "租约过期", value: formatLeaseExpiry(input.leaseExpiresAt) },
      { label: "续租间隔", value: formatHeartbeatInterval(input.heartbeatIntervalSeconds) },
      { label: "草稿版本", value: asString(input.draftVersion ?? "-") },
      { label: "基线布局", value: asString(input.baseLayoutVersion ?? "-") },
      { label: "PIN 会话", value: input.pinActive ? "已验证" : "待验证" },
    ],
    hotspots,
    backgroundAssetId: asOptionalString(draft?.background_asset_id),
    backgroundImageUrl: asOptionalString(draft?.background_image_url),
    backgroundImageSize: parseImageSize(draft?.background_image_size),
    layoutMeta: asJsonObject(draft?.layout_meta) ?? {},
    modeLabel,
    helperText,
    eventRows: input.events.slice(0, 8).map((event) => {
      const presentation = formatRealtimeEvent(event);
      return {
        id: event.event_id,
        title: presentation.title,
        subtitle: presentation.subtitle,
      };
    }),
  };
}
