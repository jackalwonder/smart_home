import { describe, expect, it } from "vitest";
import type { EditorHotspotViewModel } from "../../view-models/editor";
import {
  areEditorDraftStatesEqual,
  buildDraftDiffInput,
  cloneEditorDraftState,
  resequenceHotspots,
  sortHotspots,
  type EditorDraftState,
} from "../editorDraftState";

function makeHotspot(overrides: Partial<EditorHotspotViewModel> = {}): EditorHotspotViewModel {
  return {
    id: "hotspot-1",
    label: "Kitchen light",
    deviceId: "device-1",
    x: 24,
    y: 36,
    iconType: "device",
    iconAssetId: null,
    iconAssetUrl: null,
    labelMode: "AUTO",
    isVisible: true,
    structureOrder: 0,
    ...overrides,
  };
}

function makeDraftState(overrides: Partial<EditorDraftState> = {}): EditorDraftState {
  return {
    backgroundAssetId: "background-1",
    backgroundImageUrl: "/assets/background-1.png",
    backgroundImageSize: { width: 1280, height: 720 },
    layoutMetaText: '{"theme":"night"}',
    hotspots: [makeHotspot()],
    ...overrides,
  };
}

describe("editorDraftState", () => {
  it("sorts and resequences hotspots without mutating the input order", () => {
    const hotspots = [
      makeHotspot({ id: "third", structureOrder: 30 }),
      makeHotspot({ id: "first", structureOrder: 10 }),
      makeHotspot({ id: "second", structureOrder: 20 }),
    ];

    expect(sortHotspots(hotspots).map((hotspot) => hotspot.id)).toEqual([
      "first",
      "second",
      "third",
    ]);
    expect(hotspots.map((hotspot) => hotspot.id)).toEqual(["third", "first", "second"]);

    expect(resequenceHotspots(hotspots)).toEqual([
      expect.objectContaining({ id: "first", structureOrder: 0 }),
      expect.objectContaining({ id: "second", structureOrder: 1 }),
      expect.objectContaining({ id: "third", structureOrder: 2 }),
    ]);
  });

  it("clones hotspot entries so later edits do not mutate the source draft", () => {
    const source = makeDraftState();
    const cloned = cloneEditorDraftState(source);

    cloned.hotspots[0].label = "Edited";

    expect(source.hotspots[0].label).toBe("Kitchen light");
    expect(cloned.hotspots[0].label).toBe("Edited");
  });

  it("compares persisted draft fields and hotspot ordering", () => {
    const base = makeDraftState({
      hotspots: [
        makeHotspot({ id: "a", structureOrder: 0 }),
        makeHotspot({ id: "b", structureOrder: 1 }),
      ],
    });
    const same = cloneEditorDraftState(base);
    const changedOrder = makeDraftState({
      hotspots: [
        makeHotspot({ id: "b", structureOrder: 1 }),
        makeHotspot({ id: "a", structureOrder: 0 }),
      ],
    });

    expect(areEditorDraftStatesEqual(base, same)).toBe(true);
    expect(areEditorDraftStatesEqual(base, changedOrder)).toBe(false);
  });

  it("builds draft diff input with normalized hotspot labels and save payloads", () => {
    const input = buildDraftDiffInput(
      makeDraftState({
        layoutMetaText: '{"theme":"night","hotspot_labels":{"stale":"Stale label"}}',
        hotspots: [
          makeHotspot({
            id: "empty-label",
            label: "   ",
            deviceId: "device-empty",
            structureOrder: 3,
          }),
          makeHotspot({
            id: "named",
            label: "Kitchen pendant",
            deviceId: "device-named",
            iconAssetId: "icon-1",
            labelMode: "ALWAYS",
            structureOrder: 8,
          }),
        ],
      }),
      "layout-7",
    );

    expect(input).toEqual({
      base_layout_version: "layout-7",
      background_asset_id: "background-1",
      layout_meta: {
        theme: "night",
        hotspot_labels: {
          "empty-label": "device-empty",
          named: "Kitchen pendant",
        },
      },
      hotspots: [
        {
          hotspot_id: "empty-label",
          device_id: "device-empty",
          x: 24,
          y: 36,
          icon_type: "device",
          icon_asset_id: null,
          label_mode: "AUTO",
          is_visible: true,
          structure_order: 3,
        },
        {
          hotspot_id: "named",
          device_id: "device-named",
          x: 24,
          y: 36,
          icon_type: "device",
          icon_asset_id: "icon-1",
          label_mode: "ALWAYS",
          is_visible: true,
          structure_order: 8,
        },
      ],
    });
  });
});
