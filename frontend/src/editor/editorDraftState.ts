import { type ImageSize } from "../types/image";
import type { JsonObject } from "../api/types";
import { EditorHotspotViewModel } from "../view-models/editor";

export interface EditorDraftState {
  backgroundAssetId: string | null;
  backgroundImageUrl: string | null;
  backgroundImageSize: ImageSize | null;
  layoutMetaText: string;
  hotspots: EditorHotspotViewModel[];
}

export type EditorDraftStateUpdater = (current: EditorDraftState) => EditorDraftState;

export const EMPTY_EDITOR_DRAFT_STATE: EditorDraftState = {
  backgroundAssetId: null,
  backgroundImageUrl: null,
  backgroundImageSize: null,
  layoutMetaText: "{}",
  hotspots: [],
};

export function stringifyLayoutMeta(value: JsonObject) {
  return JSON.stringify(value ?? {}, null, 2);
}

export function sortHotspots(hotspots: EditorHotspotViewModel[]) {
  return [...hotspots].sort((left, right) => left.structureOrder - right.structureOrder);
}

export function resequenceHotspots(hotspots: EditorHotspotViewModel[]) {
  return sortHotspots(hotspots).map((hotspot, index) => ({
    ...hotspot,
    structureOrder: index,
  }));
}

export function buildLayoutMetaWithHotspotLabels(
  layoutMeta: JsonObject,
  hotspots: EditorHotspotViewModel[],
) {
  return {
    ...layoutMeta,
    hotspot_labels: Object.fromEntries(
      hotspots.map((hotspot) => [
        hotspot.id,
        hotspot.label.trim() || hotspot.deviceId.trim() || hotspot.id,
      ]),
    ),
  };
}

export function cloneEditorDraftState(state: EditorDraftState): EditorDraftState {
  return {
    ...state,
    hotspots: state.hotspots.map((hotspot) => ({ ...hotspot })),
  };
}

export function areEditorDraftStatesEqual(left: EditorDraftState, right: EditorDraftState) {
  if (
    left.backgroundAssetId !== right.backgroundAssetId ||
    left.backgroundImageUrl !== right.backgroundImageUrl ||
    left.layoutMetaText !== right.layoutMetaText ||
    left.hotspots.length !== right.hotspots.length
  ) {
    return false;
  }

  return left.hotspots.every((leftHotspot, index) => {
    const rightHotspot = right.hotspots[index];
    return (
      leftHotspot.id === rightHotspot.id &&
      leftHotspot.label === rightHotspot.label &&
      leftHotspot.deviceId === rightHotspot.deviceId &&
      leftHotspot.x === rightHotspot.x &&
      leftHotspot.y === rightHotspot.y &&
      leftHotspot.iconType === rightHotspot.iconType &&
      leftHotspot.iconAssetId === rightHotspot.iconAssetId &&
      leftHotspot.iconAssetUrl === rightHotspot.iconAssetUrl &&
      leftHotspot.labelMode === rightHotspot.labelMode &&
      leftHotspot.isVisible === rightHotspot.isVisible &&
      leftHotspot.structureOrder === rightHotspot.structureOrder
    );
  });
}

export function parseLayoutMetaText(value: string) {
  const parsed = JSON.parse(value || "{}");
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as JsonObject)
    : {};
}

export function buildDraftHotspotInputs(hotspots: EditorHotspotViewModel[]) {
  return hotspots.map((hotspot, index) => ({
    hotspot_id: hotspot.id,
    device_id: hotspot.deviceId.trim(),
    x: hotspot.x,
    y: hotspot.y,
    icon_type: hotspot.iconType,
    icon_asset_id: hotspot.iconAssetId,
    label_mode: hotspot.labelMode,
    is_visible: hotspot.isVisible,
    structure_order: hotspot.structureOrder ?? index,
  }));
}

export function buildDraftDiffInput(
  draftState: EditorDraftState,
  baseLayoutVersion: string | null,
) {
  const parsedLayoutMeta = parseLayoutMetaText(draftState.layoutMetaText);
  return {
    base_layout_version: baseLayoutVersion,
    background_asset_id: draftState.backgroundAssetId,
    layout_meta: buildLayoutMetaWithHotspotLabels(parsedLayoutMeta, draftState.hotspots),
    hotspots: buildDraftHotspotInputs(draftState.hotspots),
  };
}
