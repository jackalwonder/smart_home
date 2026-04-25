import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { EditorHotspotViewModel } from "../../../view-models/editor";
import type { EditorDraftState, EditorDraftStateUpdater } from "../../editorDraftState";
import { useEditorHotspotBatchEditing } from "../useEditorHotspotBatchEditing";

function makeHotspot(
  id: string,
  overrides: Partial<EditorHotspotViewModel> = {},
): EditorHotspotViewModel {
  return {
    id,
    label: id,
    deviceId: `device-${id}`,
    x: 0.2,
    y: 0.2,
    iconType: "device",
    iconAssetId: null,
    iconAssetUrl: null,
    labelMode: "AUTO",
    isVisible: true,
    structureOrder: 0,
    ...overrides,
  };
}

function makeDraftState(hotspots: EditorHotspotViewModel[]): EditorDraftState {
  return {
    backgroundAssetId: null,
    backgroundImageUrl: null,
    backgroundImageSize: null,
    layoutMetaText: "{}",
    hotspots,
  };
}

function createBatchHarness(options?: {
  batchSelectedHotspotIds?: string[];
  canEdit?: boolean;
  initialDraft?: EditorDraftState;
}) {
  let draftState =
    options?.initialDraft ??
    makeDraftState([
      makeHotspot("a", { x: 0.1, y: 0.4, structureOrder: 2 }),
      makeHotspot("b", { x: 0.5, y: 0.2, structureOrder: 1 }),
      makeHotspot("c", { x: 0.9, y: 0.8, structureOrder: 0 }),
      makeHotspot("outside", { x: 0.3, y: 0.7, structureOrder: 3 }),
    ]);
  const historyCalls: Array<{ label: string; groupKey?: string }> = [];
  const updateDraftStateWithHistory = vi.fn(
    (updater: EditorDraftStateUpdater, label: string, groupKey?: string) => {
      draftState = updater(draftState);
      historyCalls.push({ label, groupKey });
    },
  );

  const hook = renderHook(() =>
    useEditorHotspotBatchEditing({
      batchSelectedHotspotIds: options?.batchSelectedHotspotIds ?? ["a", "b", "c"],
      canEdit: options?.canEdit ?? true,
      updateDraftStateWithHistory,
    }),
  );

  return {
    getDraftState: () => draftState,
    historyCalls,
    updateDraftStateWithHistory,
    ...hook,
  };
}

function positionsById(draftState: EditorDraftState) {
  return Object.fromEntries(
    draftState.hotspots.map((hotspot) => [hotspot.id, { x: hotspot.x, y: hotspot.y }]),
  );
}

describe("useEditorHotspotBatchEditing", () => {
  it("aligns selected hotspots while leaving unselected hotspots untouched", () => {
    const { result, getDraftState, historyCalls } = createBatchHarness();

    act(() => {
      result.current.alignBatchHotspots("left");
    });

    expect(positionsById(getDraftState())).toEqual({
      a: { x: 0.1, y: 0.4 },
      b: { x: 0.1, y: 0.2 },
      c: { x: 0.1, y: 0.8 },
      outside: { x: 0.3, y: 0.7 },
    });
    expect(historyCalls).toEqual([{ label: "批量对齐热点", groupKey: undefined }]);
  });

  it("distributes selected hotspots by axis ordering", () => {
    const { result, getDraftState } = createBatchHarness();

    act(() => {
      result.current.distributeBatchHotspots("vertical");
    });

    expect(positionsById(getDraftState())).toEqual({
      a: { x: 0.1, y: 0.5 },
      b: { x: 0.5, y: 0.2 },
      c: { x: 0.9, y: 0.8 },
      outside: { x: 0.3, y: 0.7 },
    });
  });

  it("supports explicit step distribution and clamps positions into canvas bounds", () => {
    const { result, getDraftState } = createBatchHarness({
      initialDraft: makeDraftState([
        makeHotspot("a", { x: 0.88, y: 0.2, structureOrder: 0 }),
        makeHotspot("b", { x: 0.94, y: 0.4, structureOrder: 1 }),
        makeHotspot("c", { x: 0.99, y: 0.6, structureOrder: 2 }),
      ]),
    });

    act(() => {
      result.current.distributeBatchHotspotsByStep("x", "10");
    });

    expect(positionsById(getDraftState())).toEqual({
      a: { x: 0.88, y: 0.2 },
      b: { x: 0.98, y: 0.4 },
      c: { x: 1, y: 0.6 },
    });
  });

  it("updates shared batch fields for all selected hotspots", () => {
    const { result, getDraftState } = createBatchHarness({
      batchSelectedHotspotIds: ["a", "c"],
    });

    act(() => {
      result.current.setBatchPosition("y", "120");
      result.current.setBatchVisibility(false);
      result.current.setBatchIconType("lightbulb");
      result.current.setBatchLabelMode("ALWAYS");
    });

    const selected = getDraftState().hotspots.filter((hotspot) =>
      ["a", "c"].includes(hotspot.id),
    );
    expect(selected).toEqual([
      expect.objectContaining({
        id: "a",
        y: 1,
        isVisible: false,
        iconType: "lightbulb",
        labelMode: "ALWAYS",
      }),
      expect.objectContaining({
        id: "c",
        y: 1,
        isVisible: false,
        iconType: "lightbulb",
        labelMode: "ALWAYS",
      }),
    ]);
    expect(getDraftState().hotspots.find((hotspot) => hotspot.id === "b")).toEqual(
      expect.objectContaining({
        y: 0.2,
        isVisible: true,
        iconType: "device",
        labelMode: "AUTO",
      }),
    );
  });

  it("does not write history when editing is disabled", () => {
    const { result, updateDraftStateWithHistory } = createBatchHarness({
      canEdit: false,
    });

    act(() => {
      result.current.alignBatchHotspots("right");
      result.current.setBatchVisibility(false);
    });

    expect(updateDraftStateWithHistory).not.toHaveBeenCalled();
  });
});
