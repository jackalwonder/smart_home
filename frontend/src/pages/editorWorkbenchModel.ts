import { EditorDraftDiffDto } from "../api/types";
import { parseLayoutMetaText, type EditorDraftState } from "../editor/editorDraftState";
import { type ImageSize, hasImageSize } from "../types/image";
import { EditorHotspotViewModel } from "../view-models/editor";

export interface EditorPublishSummaryItem {
  label: string;
  value: string;
  count?: number;
}

export interface EditorPublishSummaryViewModel {
  items: EditorPublishSummaryItem[];
  totalChanges: number;
}

export function normalizeImageSize(
  value:
    | {
        width?: number | null;
        height?: number | null;
      }
    | null
    | undefined,
): ImageSize | null {
  if (!value) {
    return null;
  }

  const normalized: ImageSize = {
    width: value.width ?? null,
    height: value.height ?? null,
  };
  return hasImageSize(normalized) ? normalized : null;
}

export function mapPublishSummary(diff: EditorDraftDiffDto): EditorPublishSummaryViewModel {
  return {
    totalChanges: diff.total_changes ?? 0,
    items: (diff.items ?? []).map((item) => ({
      label: item.label ?? "-",
      value: item.summary ?? "-",
      count: item.count ?? undefined,
    })),
  };
}

function parseLayoutMetaTextSafe(value: string) {
  try {
    return parseLayoutMetaText(value);
  } catch {
    return {};
  }
}

function normalizeForComparison(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeForComparison);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== "hotspot_labels")
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalizeForComparison(item)]),
    );
  }
  return value;
}

function formatHotspotList(hotspots: EditorHotspotViewModel[]) {
  const names = hotspots.slice(0, 3).map((hotspot) => hotspot.label || hotspot.id);
  return hotspots.length > 3
    ? `${names.join("、")} 等 ${hotspots.length} 个`
    : names.join("、");
}

export function buildLocalPublishSummary(
  current: EditorDraftState,
  baseline: EditorDraftState | null,
): EditorPublishSummaryViewModel {
  if (!baseline) {
    return { items: [], totalChanges: 0 };
  }

  const currentById = new Map(current.hotspots.map((hotspot) => [hotspot.id, hotspot]));
  const baselineById = new Map(baseline.hotspots.map((hotspot) => [hotspot.id, hotspot]));
  const added = current.hotspots.filter((hotspot) => !baselineById.has(hotspot.id));
  const removed = baseline.hotspots.filter((hotspot) => !currentById.has(hotspot.id));
  const moved: EditorHotspotViewModel[] = [];
  const relabeled: EditorHotspotViewModel[] = [];
  const rebound: EditorHotspotViewModel[] = [];
  const restyled: EditorHotspotViewModel[] = [];
  const reordered: EditorHotspotViewModel[] = [];

  for (const hotspot of current.hotspots) {
    const previous = baselineById.get(hotspot.id);
    if (!previous) {
      continue;
    }
    if (
      Math.abs(hotspot.x - previous.x) > 0.0005 ||
      Math.abs(hotspot.y - previous.y) > 0.0005
    ) {
      moved.push(hotspot);
    }
    if (hotspot.label !== previous.label) {
      relabeled.push(hotspot);
    }
    if (hotspot.deviceId !== previous.deviceId) {
      rebound.push(hotspot);
    }
    if (
      hotspot.iconType !== previous.iconType ||
      hotspot.iconAssetId !== previous.iconAssetId ||
      hotspot.labelMode !== previous.labelMode ||
      hotspot.isVisible !== previous.isVisible
    ) {
      restyled.push(hotspot);
    }
    if (hotspot.structureOrder !== previous.structureOrder) {
      reordered.push(hotspot);
    }
  }

  const items: EditorPublishSummaryItem[] = [];
  const groups: Array<[string, EditorHotspotViewModel[]]> = [
    ["新增热点", added],
    ["移除热点", removed],
    ["位置调整", moved],
    ["名称更新", relabeled],
    ["设备绑定更新", rebound],
    ["展示样式更新", restyled],
    ["排序更新", reordered],
  ];
  let totalChanges = 0;
  for (const [label, hotspots] of groups) {
    if (!hotspots.length) {
      continue;
    }
    items.push({
      label,
      value: formatHotspotList(hotspots),
      count: hotspots.length,
    });
    totalChanges += hotspots.length;
  }

  if (current.backgroundAssetId !== baseline.backgroundAssetId) {
    items.push({
      label: "背景图更新",
      value: current.backgroundAssetId ? "已设置或替换背景图" : "已清除背景图",
      count: 1,
    });
    totalChanges += 1;
  }

  if (
    JSON.stringify(normalizeForComparison(parseLayoutMetaTextSafe(current.layoutMetaText))) !==
    JSON.stringify(normalizeForComparison(parseLayoutMetaTextSafe(baseline.layoutMetaText)))
  ) {
    items.push({
      label: "布局元数据更新",
      value: "JSON 元数据已修改",
      count: 1,
    });
    totalChanges += 1;
  }

  return { items, totalChanges };
}
