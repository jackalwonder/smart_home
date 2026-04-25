import { act, cleanup, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DeviceListItemDto } from "../../../api/types";
import type { EditorDraftState } from "../../../editor/editorDraftState";
import { useHomeStageHotspotEditing } from "../useHomeStageHotspotEditing";

function device(input: Partial<DeviceListItemDto>): DeviceListItemDto {
  return {
    device_id: input.device_id ?? "device-1",
    display_name: input.display_name ?? "Lamp",
    room_id: input.room_id ?? "room-1",
    room_name: input.room_name ?? "Living",
    device_type: input.device_type ?? "LIGHT",
    status: input.status ?? "off",
    is_offline: input.is_offline ?? false,
    is_readonly_device: input.is_readonly_device ?? false,
    is_complex_device: input.is_complex_device ?? false,
    is_favorite: false,
    is_favorite_candidate: true,
    is_homepage_visible: true,
    is_primary_device: false,
  };
}

const initialDraft: EditorDraftState = {
  backgroundAssetId: "asset-1",
  backgroundImageUrl: "/asset.png",
  backgroundImageSize: { width: 1000, height: 600 },
  layoutMetaText: "{}",
  hotspots: [
    {
      id: "hotspot-1",
      label: "Lamp",
      deviceId: "device-1",
      x: 0.5,
      y: 0.5,
      iconType: "device",
      iconAssetId: null,
      iconAssetUrl: null,
      labelMode: "AUTO",
      isVisible: true,
      structureOrder: 0,
    },
  ],
};

function renderEditingHook(
  options: {
    canEdit?: boolean;
    draftResetKey?: number;
    initial?: EditorDraftState;
  } = {},
) {
  const devices = [
    device({ device_id: "device-1", display_name: "Lamp" }),
    device({ device_id: "device-2", display_name: "Thermostat", room_name: "Bedroom" }),
  ];
  return renderHook(
    ({ canEdit, draftResetKey }) => {
      const [draftState, setDraftState] = useState(options.initial ?? initialDraft);
      return {
        draftState,
        editing: useHomeStageHotspotEditing({
          canEdit,
          devices,
          draftResetKey,
          draftState,
          setDraftState,
        }),
      };
    },
    {
      initialProps: {
        canEdit: options.canEdit ?? true,
        draftResetKey: options.draftResetKey ?? 1,
      },
    },
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useHomeStageHotspotEditing", () => {
  it("edits selected hotspot fields and supports undo/redo", () => {
    const { result } = renderEditingHook();

    act(() => {
      result.current.editing.setSelectedHotspotField("label", "Kitchen lamp");
    });
    expect(result.current.draftState.hotspots[0].label).toBe("Kitchen lamp");
    expect(result.current.editing.historyState.undoCount).toBe(1);

    act(() => {
      result.current.editing.undoChange();
    });
    expect(result.current.draftState.hotspots[0].label).toBe("Lamp");
    expect(result.current.editing.historyState.redoCount).toBe(1);

    act(() => {
      result.current.editing.redoChange();
    });
    expect(result.current.draftState.hotspots[0].label).toBe("Kitchen lamp");
  });

  it("adds, nudges, moves, selects, and deletes hotspots", () => {
    vi.spyOn(Date, "now").mockReturnValue(1234);
    const { result } = renderEditingHook();

    act(() => {
      result.current.editing.addDeviceHotspot(device({ device_id: "device-2" }));
    });
    expect(result.current.draftState.hotspots).toHaveLength(2);
    expect(result.current.editing.selectedHotspotId).toBe("home-hotspot-device-2-1234");

    act(() => {
      result.current.editing.nudgeSelectedHotspot("right");
    });
    expect(result.current.editing.selectedHotspot?.x).toBeCloseTo(0.37);

    act(() => {
      result.current.editing.moveHotspot("home-hotspot-device-2-1234", 0.7, 0.8);
      result.current.editing.selectHotspot("hotspot-1");
    });
    expect(result.current.draftState.hotspots[1]).toEqual(
      expect.objectContaining({ x: 0.7, y: 0.8 }),
    );
    expect(result.current.editing.selectedHotspotId).toBe("hotspot-1");

    act(() => {
      result.current.editing.deleteSelectedHotspot();
    });
    expect(result.current.draftState.hotspots.map((hotspot) => hotspot.id)).toEqual([
      "home-hotspot-device-2-1234",
    ]);
  });

  it("filters unplaced devices and ignores edits while readonly", () => {
    const { result } = renderEditingHook({ canEdit: false });

    act(() => {
      result.current.editing.setDeviceSearch("bed");
      result.current.editing.addHotspot();
    });

    expect(
      result.current.editing.filteredUnplacedDevices.map((item) => item.device_id),
    ).toEqual(["device-2"]);
    expect(result.current.draftState.hotspots).toHaveLength(1);
  });
});
