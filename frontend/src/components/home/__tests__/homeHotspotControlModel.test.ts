import { describe, expect, it } from "vitest";
import type { DeviceControlSchemaItemDto, DeviceListItemDto } from "../../../api/types";
import type { HomeHotspotViewModel } from "../../../view-models/home";
import {
  buildTargetCandidates,
  deviceKind,
  getInitialValue,
  kindTitle,
  resultMessage,
  schemaTitle,
} from "../homeHotspotControlModel";

function device(input: Partial<DeviceListItemDto>): DeviceListItemDto {
  return {
    device_id: input.device_id ?? "device-1",
    display_name: input.display_name ?? "Device",
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

function hotspot(input: Partial<HomeHotspotViewModel>): HomeHotspotViewModel {
  return {
    id: "hotspot-1",
    label: "Lamp",
    deviceId: input.deviceId ?? "device-1",
    deviceType: input.deviceType ?? "LIGHT",
    deviceTypeLabel: "Light",
    iconGlyph: "•",
    iconType: "device",
    iconAssetId: null,
    iconAssetUrl: null,
    tone: "neutral",
    status: input.status ?? "off",
    statusLabel: "OFF",
    statusSummary: null,
    isOffline: input.isOffline ?? false,
    isReadonly: input.isReadonly ?? false,
    isComplex: input.isComplex ?? false,
    entryBehavior: "INLINE",
    entryBehaviorLabel: "Inline",
    x: 0.5,
    y: 0.5,
    labelMode: "AUTO",
  };
}

function schema(input: Partial<DeviceControlSchemaItemDto>): DeviceControlSchemaItemDto {
  return {
    action_type: input.action_type ?? "set",
    target_scope: input.target_scope,
    target_key: input.target_key,
    value_type: input.value_type ?? "NONE",
    value_range: input.value_range,
    allowed_values: input.allowed_values,
    unit: input.unit,
    is_quick_action: input.is_quick_action ?? false,
    requires_detail_entry: input.requires_detail_entry ?? false,
  };
}

describe("homeHotspotControlModel", () => {
  it("groups same-room devices by control kind", () => {
    const candidates = buildTargetCandidates(
      [
        device({ device_id: "device-1", device_type: "LIGHT", room_id: "room-1" }),
        device({ device_id: "device-2", device_type: "SWITCH", room_id: "room-1" }),
        device({ device_id: "device-3", device_type: "CLIMATE", room_id: "room-1" }),
        device({ device_id: "device-4", device_type: "LIGHT", room_id: "room-2" }),
      ],
      hotspot({ deviceId: "device-1" }),
      "group",
    );

    expect(candidates.map((candidate) => candidate.deviceId)).toEqual([
      "device-1",
      "device-2",
    ]);
  });

  it("keeps detail mode scoped to the anchor device", () => {
    const candidates = buildTargetCandidates(
      [device({ device_id: "device-1" }), device({ device_id: "device-2" })],
      hotspot({ deviceId: "device-1" }),
      "detail",
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0].deviceId).toBe("device-1");
  });

  it("maps kind and schema labels for compact controls", () => {
    expect(deviceKind("media_player")).toBe("media");
    expect(kindTitle("lighting", "group")).toBe("常用灯光");
    expect(
      schemaTitle(schema({ target_key: "target_temperature", value_type: "NUMBER" })),
    ).toBe("目标温度");
    expect(schemaTitle(schema({ target_key: "brightness", value_type: "INT" }))).toBe("亮度");
  });

  it("builds initial values and result messages without component state", () => {
    expect(getInitialValue(schema({ value_type: "BOOL", target_key: "power" }))).toBe(true);
    expect(getInitialValue(schema({ allowed_values: ["auto", "cool"] }))).toBe("auto");
    expect(getInitialValue(schema({ value_range: { min: 16, max: 30, step: 1 } }))).toBe(16);
    expect(resultMessage("SUCCESS", false)).toBe("OFF");
    expect(resultMessage("TIMEOUT")).toBe("TIMEOUT");
  });
});
