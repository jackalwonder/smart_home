import { describe, expect, it, vi } from "vitest";
import type { DeviceListItemDto } from "../../../api/types";
import {
  buildPlacedDeviceIds,
  clampPosition,
  createDeviceHotspot,
  filterUnplacedDevices,
  getNextHotspotPosition,
  isConflictErrorCode,
} from "../homeStageEditorModel";

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

describe("homeStageEditorModel", () => {
  it("keeps hotspot positions inside the stage", () => {
    expect(clampPosition(-0.2)).toBe(0);
    expect(clampPosition(1.2)).toBe(1);
    expect(getNextHotspotPosition(5)).toEqual({ x: 0.36, y: 0.38 });
  });

  it("builds deterministic device hotspot content around generated ids", () => {
    vi.spyOn(Date, "now").mockReturnValue(1234);

    const hotspot = createDeviceHotspot(device({ device_id: "device:abc" }), 2);

    expect(hotspot.id).toBe("home-hotspot-device-abc-1234");
    expect(hotspot.x).toBe(0.54);
    expect(hotspot.label).toBe("Lamp");
  });

  it("filters unplaced devices by current hotspots and search text", () => {
    const placed = buildPlacedDeviceIds([
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
    ]);

    const result = filterUnplacedDevices(
      [
        device({ device_id: "device-1", display_name: "Lamp" }),
        device({ device_id: "device-2", display_name: "Thermostat", room_name: "Bedroom" }),
      ],
      placed,
      "bed",
    );

    expect(result.map((item) => item.device_id)).toEqual(["device-2"]);
  });

  it("identifies lock and version conflicts", () => {
    expect(isConflictErrorCode("VERSION_CONFLICT")).toBe(true);
    expect(isConflictErrorCode("DRAFT_LOCK_LOST")).toBe(true);
    expect(isConflictErrorCode("NETWORK_ERROR")).toBe(false);
  });
});
