import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { EditorDraftLayoutDto } from "../../../api/types";
import type { EditorViewModel } from "../../../view-models/editor";
import { useEditorDraftState } from "../useEditorDraftState";

function makeViewModel(overrides: Partial<EditorViewModel> = {}): EditorViewModel {
  return {
    backgroundAssetId: "background-1",
    backgroundImageSize: { width: 1280, height: 720 },
    backgroundImageUrl: "/assets/background-1.png",
    commandRows: [],
    eventRows: [],
    helperText: "Ready",
    hotspots: [
      {
        deviceId: "device-1",
        iconAssetId: null,
        iconAssetUrl: null,
        iconType: "device",
        id: "hotspot-1",
        isVisible: true,
        label: "Kitchen",
        labelMode: "AUTO",
        structureOrder: 0,
        x: 20,
        y: 30,
      },
    ],
    layoutMeta: { theme: "night" },
    modeLabel: "Editing",
    ...overrides,
  };
}

function makeDraftSource(version: string): EditorDraftLayoutDto {
  return {
    background_asset_id: "background-1",
    background_image_url: `/assets/${version}.png`,
    background_image_size: { width: 1280, height: 720 },
    hotspots: [],
    layout_meta: { version },
  };
}

describe("useEditorDraftState", () => {
  it("does not overwrite unsaved local edits when an identical granted snapshot replays", async () => {
    const snapshot = {
      baseLayoutVersion: "layout-1",
      draftVersion: "draft-1",
      leaseId: "lease-1",
      lockStatus: "GRANTED",
    };
    const { result, rerender } = renderHook(
      ({ draftSource, viewModel }) =>
        useEditorDraftState({
          canEdit: true,
          draftSource,
          snapshot,
          viewModel,
        }),
      {
        initialProps: {
          draftSource: makeDraftSource("initial"),
          viewModel: makeViewModel(),
        },
      },
    );

    await waitFor(() => {
      expect(result.current.draftState.backgroundAssetId).toBe("background-1");
    });

    act(() => {
      result.current.setDraftState((current) => ({
        ...current,
        backgroundAssetId: "local-background",
        backgroundImageUrl: "/assets/local-background.png",
      }));
    });

    rerender({
      draftSource: makeDraftSource("stale-replay"),
      viewModel: makeViewModel({
        backgroundAssetId: "background-1",
        backgroundImageUrl: "/assets/stale-replay.png",
      }),
    });

    expect(result.current.draftState.backgroundAssetId).toBe("local-background");
    expect(result.current.draftState.backgroundImageUrl).toBe("/assets/local-background.png");
  });
});
