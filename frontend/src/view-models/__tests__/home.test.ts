import { describe, expect, it } from "vitest";
import type { HomeOverviewDto } from "../../api/types";
import { mapHomeOverviewViewModel } from "../home";

const baseOverviewFixture: HomeOverviewDto = {
  cache_mode: false,
  energy_bar: null,
  favorite_devices: [],
  home_info: { home_id: "home-1" },
  layout_version: "layout-v1",
  quick_entries: { favorites: true },
  settings_version: "settings-v1",
  sidebar: {
    datetime: { current_time: "2026-04-26T10:00:00Z", terminal_mode: "KIOSK" },
    music_card: {
      availability_status: "UNAVAILABLE",
      binding_status: "UNBOUND",
      display_name: null,
      play_state: "IDLE",
    },
    summary: {
      lights_on_count: 0,
      low_battery_count: 0,
      offline_count: 0,
      online_count: 0,
      position_device_summary: { closed_count: 0, opened_count: 0, partial_count: 0 },
      running_device_count: 0,
    },
    weather: {
      cache_mode: false,
      condition: "sunny",
      fetched_at: "2026-04-26T10:00:00Z",
      humidity: 50,
      location_label: "上海",
      precipitation: 0,
      temperature: 22,
    },
  },
  stage: { background_image_url: null, hotspots: [] },
  system_state: {
    default_media: { availability_status: "UNAVAILABLE", binding_status: "UNBOUND" },
    home_assistant: null,
  },
  ui_policy: {
    favorite_limit: 8,
    homepage_display_policy: { show_favorites: true },
    room_label_mode: "EDIT_ONLY",
  },
};

function overviewFixture(patch: Partial<HomeOverviewDto>): HomeOverviewDto {
  return {
    ...baseOverviewFixture,
    ...patch,
  };
}

describe("home overview view model", () => {
  it("puts energy status and source update first for the home energy card", () => {
    const viewModel = mapHomeOverviewViewModel(
      overviewFixture({
        energy_bar: {
          balance: 23.5,
          binding_status: "BOUND",
          monthly_usage: 102,
          refresh_status: "SUCCESS",
          source_updated_at: "2026-04-24T15:40:00Z",
          yearly_usage: 1200,
          yesterday_usage: 8.5,
        },
      }),
    );

    expect(viewModel.energyFields.slice(0, 3)).toEqual([
      { label: "状态", value: "已绑定" },
      { label: "上月用电", value: "102 kWh" },
      { label: "账户余额", value: "23.5 元" },
    ]);
    expect(viewModel.railCards.find((card) => card.key === "energy")?.subtitle).toContain(
      "来源更新时间",
    );
    expect(viewModel.bottomStats.map((stat) => stat.label)).toEqual([
      "昨日用电",
      "上月用电",
      "账户余额",
      "年度累计",
    ]);
    expect(viewModel.bottomStats.map((stat) => stat.label)).not.toContain("能耗状态");
    expect(viewModel.bottomStats.map((stat) => stat.label)).not.toContain("刷新状态");
    expect(viewModel.bottomStats.map((stat) => stat.label)).not.toContain("HA 源更新");
  });

  it("points unbound energy state back to settings work", () => {
    const viewModel = mapHomeOverviewViewModel(
      overviewFixture({
        energy_bar: {
          binding_status: "UNBOUND",
          refresh_status: "PENDING",
        },
      }),
    );

    expect(viewModel.energyFields[0]).toEqual({ label: "状态", value: "未绑定" });
    expect(viewModel.railCards.find((card) => card.key === "energy")?.title).toBe("等待绑定");
  });

  it("maps typed stage and dynamic policy fixture fields without widening the adapter input", () => {
    const viewModel = mapHomeOverviewViewModel(
      overviewFixture({
        quick_entries: {
          energy: true,
          favorites: true,
          media: false,
          scene: true,
        },
        favorite_devices: [
          {
            device_id: "light-1",
            device_type: "LIGHT",
            display_name: "客厅灯",
            entry_behavior: "OPEN_CONTROL_CARD",
            is_complex_device: false,
            is_offline: false,
            is_readonly_device: false,
            status: "ONLINE",
          },
        ],
        sidebar: {
          ...baseOverviewFixture.sidebar,
          weather: {
            cache_mode: true,
            condition: "rain",
            fetched_at: "2026-04-26T10:00:00Z",
            forecast: [
              {
                date: "2026-04-26",
                condition: "rain",
                temperature_max: 19,
                temperature_min: 13,
                precipitation: 2,
              },
              {
                date: "2026-04-27",
                condition: "cloudy",
                high: 21,
                low: 15,
                precipitation_sum: 0,
              },
            ],
            humidity: 75,
            location_label: "上海",
            precipitation: 2,
            temperature: 18,
          },
        },
        stage: {
          hotspots: [
            {
              device_id: "light-1",
              device_type: "LIGHT",
              display_name: "客厅灯",
              entry_behavior: "OPEN_CONTROL_CARD",
              hotspot_id: "hotspot-1",
              icon_asset_id: null,
              icon_asset_url: null,
              icon_type: "light",
              is_complex_device: false,
              is_offline: false,
              is_readonly_device: false,
              label_mode: "ALWAYS",
              status: "ONLINE",
              status_summary: { primary: "开启" },
              x: 0.3,
              y: 0.4,
            },
          ],
        },
      }),
    );

    expect(viewModel.stage.hotspots[0]).toMatchObject({
      deviceId: "light-1",
      label: "客厅灯",
      statusLabel: "已开启",
    });
    expect(viewModel.showFavoriteDevices).toBe(true);
    expect(viewModel.quickActions.map((action) => action.key)).toEqual(["energy", "scene"]);
    expect(viewModel.timeline).toMatchObject({
      weatherCondition: "降雨",
      weatherDataStatus: "过时",
      precipitation: "2 mm",
    });
    expect(viewModel.weatherTrend.slice(0, 2)).toEqual([
      expect.objectContaining({
        key: "2026-04-26",
        label: "今天",
        high: "19°",
        low: "13°",
        precipitation: "2 mm",
      }),
      expect.objectContaining({
        key: "2026-04-27",
        label: "明天",
        high: "21°",
        low: "15°",
        precipitation: "0 mm",
      }),
    ]);
  });

  it("maps typed quick entry arrays without exposing favorites", () => {
    const viewModel = mapHomeOverviewViewModel(
      overviewFixture({
        quick_entries: [
          { key: "favorites", title: "Favorites", badge_count: 99 },
          { key: "devices", title: "设备总览", badge_count: 3 },
          { key: "custom_panel", title: "自定义", badge_count: "新" },
        ],
      }),
    );

    expect(viewModel.quickActions).toEqual([
      { key: "devices", title: "设备状态", badgeCount: "3" },
      { key: "custom_panel", title: "自定义", badgeCount: "新" },
    ]);
  });
});
