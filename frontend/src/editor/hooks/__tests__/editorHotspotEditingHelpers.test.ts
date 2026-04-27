import { describe, expect, it } from "vitest";
import type { EditorHotspotViewModel } from "../../../view-models/editor";
import {
  applyHotspotFieldUpdate,
  buildDeviceHotspot,
  buildDuplicatedHotspot,
  buildEmptyHotspot,
} from "../editorHotspotEditingHelpers";

const baseDevice = {
  device_id: "light.one",
  device_type: "LIGHT",
  display_name: "客厅灯",
} as any;

const baseHotspot: EditorHotspotViewModel = {
  id: "hs-1",
  label: "客厅灯",
  deviceId: "light.one",
  x: 0.3,
  y: 0.4,
  iconType: "device",
  iconAssetId: null,
  iconAssetUrl: null,
  labelMode: "AUTO",
  isVisible: true,
  structureOrder: 0,
};

describe("editorHotspotEditingHelpers", () => {
  describe("buildEmptyHotspot", () => {
    it("creates a new hotspot at center position with device icon", () => {
      const result = buildEmptyHotspot(3);
      expect(result.label).toBe("热点 3");
      expect(result.deviceId).toBe("");
      expect(result.x).toBe(0.5);
      expect(result.y).toBe(0.5);
      expect(result.iconType).toBe("device");
      expect(result.iconAssetId).toBeNull();
      expect(result.isVisible).toBe(true);
      expect(result.labelMode).toBe("AUTO");
      expect(result.structureOrder).toBe(2);
    });

    it("starts hotspot id with draft-hotspot prefix", () => {
      const result = buildEmptyHotspot(1);
      expect(result.id).toMatch(/^draft-hotspot-/);
    });
  });

  describe("buildDeviceHotspot", () => {
    it("creates a hotspot with device info and computed position", () => {
      const result = buildDeviceHotspot(baseDevice, 1);
      expect(result.deviceId).toBe("light.one");
      expect(result.label).toBe("客厅灯");
      expect(result.iconType).toBe("lightbulb");
      expect(result.isVisible).toBe(true);
    });

    it("assigns position based on order index", () => {
      const first = buildDeviceHotspot(baseDevice, 1);
      const second = buildDeviceHotspot(baseDevice, 7);
      expect(first.x).not.toBe(second.x);
      expect(first.structureOrder).toBe(0);
      expect(second.structureOrder).toBe(6);
    });
  });

  describe("buildDuplicatedHotspot", () => {
    it("creates a copy with modified id, label, position, and order", () => {
      const result = buildDuplicatedHotspot(baseHotspot, 4);
      expect(result.id).toMatch(/^hs-1-copy-/);
      expect(result.label).toBe("客厅灯 副本");
      expect(result.x).toBeCloseTo(0.34, 1);
      expect(result.y).toBeCloseTo(0.44, 1);
      expect(result.deviceId).toBe(baseHotspot.deviceId);
      expect(result.iconType).toBe(baseHotspot.iconType);
      expect(result.structureOrder).toBe(3);
    });
  });

  describe("applyHotspotFieldUpdate", () => {
    it("updates x position from percentage", () => {
      const result = applyHotspotFieldUpdate(baseHotspot, "x", "50", []);
      expect(result.x).toBe(0.5);
    });

    it("clamps x and y to 0-1 range", () => {
      const lowX = applyHotspotFieldUpdate(baseHotspot, "x", "-10", []);
      expect(lowX.x).toBe(0);
      const highY = applyHotspotFieldUpdate(baseHotspot, "y", "200", []);
      expect(highY.y).toBe(1);
    });

    it("updates structureOrder with rounding", () => {
      const result = applyHotspotFieldUpdate(baseHotspot, "structureOrder", "3", []);
      expect(result.structureOrder).toBe(3);
    });

    it("updates label text", () => {
      const result = applyHotspotFieldUpdate(baseHotspot, "label", "新标签", []);
      expect(result.label).toBe("新标签");
    });

    it("updates deviceId and resolves label from catalog", () => {
      const catalog = [baseDevice];
      const result = applyHotspotFieldUpdate(baseHotspot, "deviceId", "light.one", catalog);
      expect(result.deviceId).toBe("light.one");
      expect(result.label).toBe("客厅灯");
    });

    it("clears icon asset when iconType changes", () => {
      const hotspot = { ...baseHotspot, iconAssetId: "asset-1", iconAssetUrl: "http://img" };
      const result = applyHotspotFieldUpdate(hotspot, "iconType", "custom", []);
      expect(result.iconType).toBe("custom");
      expect(result.iconAssetId).toBeNull();
      expect(result.iconAssetUrl).toBeNull();
    });

    it("falls back to spreading unknown fields", () => {
      const result = applyHotspotFieldUpdate(baseHotspot, "labelMode", "MANUAL", []);
      expect(result.labelMode).toBe("MANUAL");
    });
  });
});
