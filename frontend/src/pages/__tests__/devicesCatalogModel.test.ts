import { describe, expect, it } from "vitest";
import { SettingsDto } from "../../api/types";
import {
  buildCatalogStats,
  buildNextFavorites,
  buildSettingsSaveInput,
  describeControlSchema,
  filterDevicesByOfflineStatus,
  formatControlAction,
  formatDeviceStatus,
  getHomeEntryLabel,
} from "../devicesCatalogModel";

const baseDevice = {
  alert_badges: [],
  capabilities: {},
  confirmation_type: null,
  default_control_target: null,
  device_id: "device-1",
  device_type: "LIGHT",
  display_name: "灯",
  favorite_exclude_reason: null,
  favorite_order: null,
  home_entry_enabled: false,
  is_complex_device: false,
  is_favorite: false,
  is_favorite_candidate: true,
  is_homepage_visible: false,
  is_offline: false,
  is_primary_device: false,
  is_readonly_device: false,
  raw_name: "light.one",
  room_id: "room",
  room_name: "客厅",
  status: "online",
  status_summary: undefined,
};

describe("devices catalog model", () => {
  it("formats status, home entry label, and control schema for visible UI", () => {
    expect(formatDeviceStatus("unknown")).toBe("状态未知");
    expect(formatDeviceStatus("active")).toBe("在线");
    expect(getHomeEntryLabel(baseDevice)).toBe("可加入首页");
    expect(formatControlAction("EXECUTE_ACTION")).toBe("执行动作");

    expect(
      describeControlSchema({
        action_type: "EXECUTE_ACTION",
        allowed_values: [],
        is_quick_action: false,
        requires_detail_entry: false,
        target_key: "button.wakeup_device",
        target_scope: "PRIMARY",
        unit: null,
        value_range: null,
        value_type: "NONE",
      }),
    ).toEqual({ target: "主操作", value: "无需输入" });
  });

  it("filters catalog devices and derives stats from the visible rows", () => {
    const offlineDevice = {
      ...baseDevice,
      device_id: "device-2",
      is_favorite: true,
      is_offline: true,
      is_readonly_device: true,
    };
    const devices = [baseDevice, offlineDevice];

    expect(filterDevicesByOfflineStatus(devices, "ONLINE")).toEqual([baseDevice]);
    expect(filterDevicesByOfflineStatus(devices, "OFFLINE")).toEqual([offlineDevice]);
    expect(buildCatalogStats(devices)).toEqual({
      homeEntryCount: 1,
      offlineCount: 1,
      onlineCount: 1,
      readonlyCount: 1,
    });
  });

  it("builds settings save payloads without dropping existing settings defaults", () => {
    const settings = {
      favorites: [
        { device_id: "old", favorite_order: 2, selected: true },
        { device_id: "device-1", favorite_order: 1, selected: true },
      ],
      function_settings: {
        auto_home_timeout_seconds: 45,
        favorite_limit: 5,
        low_battery_threshold: 10,
        music_enabled: false,
        offline_threshold_seconds: 120,
        position_device_thresholds: { sensor: 2 },
        quick_entry_policy: { favorites: false },
      },
      page_settings: {
        homepage_display_policy: { show_favorites: true },
        icon_policy: { tone: "smart" },
        layout_preference: { columns: 2 },
        room_label_mode: "ROOM_NAME",
      },
      settings_version: "v10",
    } as unknown as SettingsDto;

    const nextFavorites = buildNextFavorites(settings, "new-device", "add");
    expect(nextFavorites).toContainEqual({
      device_id: "new-device",
      favorite_order: 3,
      selected: true,
    });
    expect(buildNextFavorites(settings, "device-1", "remove")).toEqual([
      { device_id: "old", favorite_order: 2, selected: true },
    ]);

    expect(buildSettingsSaveInput(settings, nextFavorites)).toMatchObject({
      function_settings: {
        favorite_limit: 5,
        low_battery_threshold: 10,
        music_enabled: false,
      },
      page_settings: {
        homepage_display_policy: { show_favorites: true },
        room_label_mode: "ROOM_NAME",
      },
      settings_version: "v10",
    });
  });
});
