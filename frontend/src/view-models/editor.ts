import { formatRealtimeEvent } from "../ws/eventPresentation";
import { WsEvent } from "../ws/types";
import { asArray, asNumber, asOptionalString, asRecord, asString } from "./utils";

export interface EditorHotspotViewModel {
  id: string;
  label: string;
  deviceId: string;
  x: number;
  y: number;
  iconType: string;
  labelMode: string;
  isVisible: boolean;
  structureOrder: number;
}

export interface EditorViewModel {
  commandRows: Array<{ label: string; value: string }>;
  hotspots: EditorHotspotViewModel[];
  backgroundImageUrl: string | null;
  layoutMeta: Record<string, unknown>;
  modeLabel: string;
  helperText: string;
  eventRows: Array<{ id: string; title: string; subtitle: string }>;
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

export function mapEditorViewModel(input: {
  lockStatus: string | null;
  leaseId: string | null;
  draft: Record<string, unknown> | null;
  draftVersion: string | null;
  baseLayoutVersion: string | null;
  readonly: boolean;
  pinActive: boolean;
  events: WsEvent[];
}): EditorViewModel {
  const draft = asRecord(input.draft);
  const hotspots = asArray<Record<string, unknown>>(draft?.hotspots)
    .map((hotspot, index) => ({
      id: asString(hotspot.hotspot_id ?? `draft-hotspot-${index}`),
      label: asString(
        hotspot.display_name ?? hotspot.device_id ?? hotspot.entity_id ?? `Hotspot ${index + 1}`,
      ),
      deviceId: asString(hotspot.device_id ?? hotspot.entity_id ?? ""),
      x: asNumber(hotspot.x),
      y: asNumber(hotspot.y),
      iconType: asString(hotspot.icon_type ?? "device"),
      labelMode: asString(hotspot.label_mode ?? "AUTO"),
      isVisible: hotspot.is_visible !== false,
      structureOrder: asNumber(hotspot.structure_order, index),
    }))
    .sort((left, right) => left.structureOrder - right.structureOrder);

  let modeLabel = "只读预览";
  let helperText = "请先验证管理 PIN，再申请可写的编辑租约。";

  if (input.lockStatus === "GRANTED") {
    modeLabel = "租约已获取";
    helperText = "当前终端已持有草稿租约，可以继续编辑并在确认后发布。";
  } else if (input.lockStatus === "LOCKED_BY_OTHER") {
    modeLabel = "被其他终端占用";
    helperText = "当前草稿被其他终端占用，你可以先查看，再决定是否接管。";
  } else if (input.pinActive) {
    helperText = "PIN 已验证，编辑器正在等待可写租约。";
  }

  return {
    commandRows: [
      { label: "锁状态", value: translateLockStatus(input.lockStatus) },
      { label: "租约 ID", value: asString(input.leaseId ?? "-") },
      { label: "草稿版本", value: asString(input.draftVersion ?? "-") },
      { label: "基线布局", value: asString(input.baseLayoutVersion ?? "-") },
      { label: "PIN 会话", value: input.pinActive ? "已验证" : "待验证" },
    ],
    hotspots,
    backgroundImageUrl: asOptionalString(draft?.background_image_url),
    layoutMeta: asRecord(draft?.layout_meta) ?? {},
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
