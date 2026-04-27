import { describe, expect, it } from "vitest";
import { SettingsDto } from "../../api/types";
import {
  buildNextFavorites,
  buildSettingsSaveInput,
  getNextFavoriteOrder,
  normalizeFavorites,
} from "../deviceFavorites";

const baseSettings = {
  favorites: [
    { device_id: "device-a", favorite_order: 0, selected: true },
    { device_id: "device-b", favorite_order: 1, selected: true },
  ],
  function_settings: null,
  page_settings: null,
  settings_version: null,
} as unknown as SettingsDto;

describe("deviceFavorites", () => {
  describe("normalizeFavorites", () => {
    it("preserves explicit order and selected flags", () => {
      const result = normalizeFavorites(baseSettings);
      expect(result).toEqual([
        { device_id: "device-a", favorite_order: 0, selected: true },
        { device_id: "device-b", favorite_order: 1, selected: true },
      ]);
    });

    it("defaults selected to true and order to index", () => {
      const settings = {
        favorites: [{ device_id: "device-c" }, { device_id: "device-d" }],
        function_settings: null,
        page_settings: null,
        settings_version: null,
      } as unknown as SettingsDto;
      expect(normalizeFavorites(settings)).toEqual([
        { device_id: "device-c", favorite_order: 0, selected: true },
        { device_id: "device-d", favorite_order: 1, selected: true },
      ]);
    });

    it("returns empty array for null favorites", () => {
      const settings = {
        favorites: null,
        function_settings: null,
        page_settings: null,
        settings_version: null,
      } as unknown as SettingsDto;
      expect(normalizeFavorites(settings)).toEqual([]);
    });
  });

  describe("getNextFavoriteOrder", () => {
    it("returns max + 1 for existing orders", () => {
      const favorites = normalizeFavorites(baseSettings);
      expect(getNextFavoriteOrder(favorites)).toBe(2);
    });

    it("returns 0 for empty favorites", () => {
      expect(getNextFavoriteOrder([])).toBe(0);
    });
  });

  describe("buildSettingsSaveInput", () => {
    it("preserves settings_version and page/function defaults", () => {
      const settings = {
        favorites: [{ device_id: "device-a", favorite_order: 0, selected: true }],
        function_settings: {
          favorite_limit: 8,
          low_battery_threshold: 20,
          music_enabled: true,
          offline_threshold_seconds: 300,
          quick_entry_policy: { favorites: true },
          auto_home_timeout_seconds: 30,
          position_device_thresholds: {},
        },
        page_settings: {
          homepage_display_policy: {},
          icon_policy: {},
          layout_preference: {},
          room_label_mode: "ROOM_NAME",
        },
        settings_version: "v5",
      } as unknown as SettingsDto;

      const result = buildSettingsSaveInput(settings, settings.favorites as any);
      expect(result.settings_version).toBe("v5");
      expect(result.page_settings?.room_label_mode).toBe("ROOM_NAME");
      expect(result.function_settings?.favorite_limit).toBe(8);
    });

    it("fills defaults for null page and function settings", () => {
      const result = buildSettingsSaveInput(baseSettings, []);
      expect(result.page_settings?.room_label_mode).toBe("ROOM_NAME");
      expect(result.function_settings?.favorite_limit).toBe(8);
    });
  });

  describe("buildNextFavorites", () => {
    it("adds a new device with correct order and selected flag", () => {
      const result = buildNextFavorites(baseSettings, "device-c", "add");
      expect(result).toHaveLength(3);
      expect(result[2]).toEqual({
        device_id: "device-c",
        favorite_order: 2,
        selected: true,
      });
    });

    it("removes an existing device", () => {
      const result = buildNextFavorites(baseSettings, "device-a", "remove");
      expect(result).toEqual([{ device_id: "device-b", favorite_order: 1, selected: true }]);
    });

    it("adds a device when favorites are empty", () => {
      const emptySettings = {
        favorites: [],
        function_settings: null,
        page_settings: null,
        settings_version: null,
      } as unknown as SettingsDto;
      const result = buildNextFavorites(emptySettings, "device-x", "add");
      expect(result).toEqual([{ device_id: "device-x", favorite_order: 0, selected: true }]);
    });
  });
});
