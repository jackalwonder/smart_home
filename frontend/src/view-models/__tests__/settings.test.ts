import { describe, expect, it } from "vitest";
import type { SettingsDto } from "../../api/types";
import { mapSettingsViewModel } from "../settings";

const settingsFixture: SettingsDto = {
  favorites: [
    {
      device_id: "light-1",
      favorite_order: 1,
      selected: true,
    },
  ],
  function_settings: {
    auto_home_timeout_seconds: 180,
    favorite_limit: 8,
    low_battery_threshold: 20,
    music_enabled: true,
    offline_threshold_seconds: 90,
    position_device_thresholds: { closed_max: 5, opened_min: 95 },
    quick_entry_policy: { favorites: true },
  },
  page_settings: {
    homepage_display_policy: { show_favorites: true },
    icon_policy: {},
    layout_preference: {},
    room_label_mode: "EDIT_ONLY",
  },
  pin_session_required: true,
  settings_version: "settings-typed-fixture",
  system_settings_summary: {
    default_media_binding_status: "MEDIA_SET",
    energy_binding_status: "BOUND",
    system_connections_configured: true,
  },
};

describe("settings view model", () => {
  it("maps a typed settings snapshot fixture", () => {
    const viewModel = mapSettingsViewModel(settingsFixture);

    expect(viewModel.version).toBe("settings-typed-fixture");
    expect(viewModel.pinRequired).toBe(true);
    expect(viewModel.sections.map((section) => section.key)).toEqual([
      "overview",
      "integrations",
      "home",
      "terminal",
      "backup",
    ]);
    expect(viewModel.overview).toEqual([
      { label: "设置版本", value: "settings-typed-fixture" },
      { label: "需要 PIN", value: "是" },
      { label: "系统连接", value: "已配置" },
      { label: "能耗绑定", value: "BOUND" },
      { label: "默认媒体", value: "MEDIA_SET" },
      { label: "首页常用设备", value: "1" },
    ]);
  });

  it("keeps fallback output stable for nullable settings sections", () => {
    const viewModel = mapSettingsViewModel({
      ...settingsFixture,
      favorites: undefined,
      function_settings: null,
      page_settings: null,
      settings_version: null,
      system_settings_summary: {
        default_media_binding_status: "UNBOUND",
        energy_binding_status: "UNBOUND",
        system_connections_configured: false,
      },
    });

    expect(viewModel.version).toBe("settings_v1");
    expect(viewModel.overview).toContainEqual({ label: "系统连接", value: "待配置" });
    expect(viewModel.overview).toContainEqual({ label: "首页常用设备", value: "0" });
  });
});
