import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { EditorHotspotViewModel } from "../../../view-models/editor";
import type { EditorDraftState, EditorDraftStateUpdater } from "../../editorDraftState";
import { useEditorHotspotCanvasEditing } from "../useEditorHotspotCanvasEditing";

function makeHotspot(
  id: string,
  overrides: Partial<EditorHotspotViewModel> = {},
): EditorHotspotViewModel {
  return {
    id,
    label: id,
    deviceId: `device-${id}`,
    x: 0.5,
    y: 0.5,
    iconType: "device",
    iconAssetId: null,
    iconAssetUrl: null,
    labelMode: "AUTO",
    isVisible: true,
    structureOrder: 0,
    ...overrides,
  };
}

function makeDraftState(): EditorDraftState {
  return {
    backgroundAssetId: null,
    backgroundImageUrl: null,
    backgroundImageSize: null,
    layoutMetaText: "{}",
    hotspots: [
      makeHotspot("a", { x: 0.01, y: 0.02, structureOrder: 0 }),
      makeHotspot("b", { x: 0.5, y: 0.6, structureOrder: 1 }),
      makeHotspot("c", { x: 0.98, y: 0.97, structureOrder: 2 }),
    ],
  };
}

function createCanvasHarness(options?: {
  batchSelectedHotspotIds?: string[];
  canEdit?: boolean;
  selectedHotspotId?: string | null;
}) {
  let draftState = makeDraftState();
  let selectedHotspotId: string | null = options?.selectedHotspotId ?? "a";
  const historyCalls: Array<{ label: string; groupKey?: string }> = [];
  const setSelectedHotspotId = vi.fn(
    (value: string | null | ((current: string | null) => string | null)) => {
      selectedHotspotId = typeof value === "function" ? value(selectedHotspotId) : value;
    },
  );
  const updateDraftStateWithHistory = vi.fn(
    (updater: EditorDraftStateUpdater, label: string, groupKey?: string) => {
      draftState = updater(draftState);
      historyCalls.push({ label, groupKey });
    },
  );

  const hook = renderHook(() =>
    useEditorHotspotCanvasEditing({
      batchSelectedHotspotIds: options?.batchSelectedHotspotIds ?? [],
      canEdit: options?.canEdit ?? true,
      selectedHotspotId,
      setSelectedHotspotId,
      updateDraftStateWithHistory,
    }),
  );

  return {
    getDraftState: () => draftState,
    getSelectedHotspotId: () => selectedHotspotId,
    historyCalls,
    setSelectedHotspotId,
    updateDraftStateWithHistory,
    ...hook,
  };
}

function positionsById(draftState: EditorDraftState) {
  return Object.fromEntries(
    draftState.hotspots.map((hotspot) => [hotspot.id, { x: hotspot.x, y: hotspot.y }]),
  );
}

describe("useEditorHotspotCanvasEditing", () => {
  it("nudges the selected hotspot and clamps it inside the canvas", () => {
    const { result, getDraftState, historyCalls } = createCanvasHarness({
      selectedHotspotId: "a",
    });

    act(() => {
      result.current.nudgeSelectedHotspot("left", 0.05);
      result.current.nudgeSelectedHotspot("up", 0.05);
    });

    expect(positionsById(getDraftState())).toEqual({
      a: { x: 0, y: 0 },
      b: { x: 0.5, y: 0.6 },
      c: { x: 0.98, y: 0.97 },
    });
    expect(historyCalls).toEqual([
      { label: "移动热点", groupKey: "nudge-hotspots" },
      { label: "移动热点", groupKey: "nudge-hotspots" },
    ]);
  });

  it("nudges batch selected hotspots instead of the single selected hotspot", () => {
    const { result, getDraftState } = createCanvasHarness({
      batchSelectedHotspotIds: ["b", "c"],
      selectedHotspotId: "a",
    });

    act(() => {
      result.current.nudgeSelectedHotspot("right", 0.08);
      result.current.nudgeSelectedHotspot("down", 0.08);
    });

    expect(positionsById(getDraftState())).toEqual({
      a: { x: 0.01, y: 0.02 },
      b: { x: 0.58, y: expect.closeTo(0.68) },
      c: { x: 1, y: 1 },
    });
  });

  it("moves a hotspot and updates the active selection", () => {
    const { result, getDraftState, getSelectedHotspotId, setSelectedHotspotId } =
      createCanvasHarness({ selectedHotspotId: "a" });

    act(() => {
      result.current.moveHotspot("b", 0.25, 0.75);
    });

    expect(setSelectedHotspotId).toHaveBeenCalledWith("b");
    expect(getSelectedHotspotId()).toBe("b");
    expect(positionsById(getDraftState())).toEqual({
      a: { x: 0.01, y: 0.02 },
      b: { x: 0.25, y: 0.75 },
      c: { x: 0.98, y: 0.97 },
    });
  });

  it("moves only hotspots present in a group drag update", () => {
    const { result, getDraftState, historyCalls } = createCanvasHarness();

    act(() => {
      result.current.moveHotspotGroup([
        { hotspotId: "a", x: 0.11, y: 0.22 },
        { hotspotId: "c", x: 0.33, y: 0.44 },
        { hotspotId: "missing", x: 0.99, y: 0.99 },
      ]);
    });

    expect(positionsById(getDraftState())).toEqual({
      a: { x: 0.11, y: 0.22 },
      b: { x: 0.5, y: 0.6 },
      c: { x: 0.33, y: 0.44 },
    });
    expect(historyCalls).toEqual([{ label: "拖动热点", groupKey: "drag-hotspots" }]);
  });

  it("does not mutate draft state when editing is disabled", () => {
    const { result, updateDraftStateWithHistory, setSelectedHotspotId } = createCanvasHarness({
      canEdit: false,
    });

    act(() => {
      result.current.nudgeSelectedHotspot("right");
      result.current.moveHotspot("b", 0.2, 0.2);
      result.current.moveHotspotGroup([{ hotspotId: "a", x: 0.2, y: 0.2 }]);
    });

    expect(updateDraftStateWithHistory).not.toHaveBeenCalled();
    expect(setSelectedHotspotId).not.toHaveBeenCalled();
  });
});
