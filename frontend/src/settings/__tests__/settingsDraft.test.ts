import { describe, expect, it } from "vitest";
import {
  createSettingsDraft,
  materializePolicyEntries,
} from "../settingsDraft";

describe("settingsDraft", () => {
  it("creates editable settings draft fields from backend settings data", () => {
    const draft = createSettingsDraft({
      page_settings: {
        room_label_mode: "ALWAYS",
        homepage_display_policy: {
          show_weather: true,
          max_cards: 6,
          nested: { mode: "compact" },
        },
      },
      function_settings: {
        music_enabled: true,
        low_battery_threshold: 25,
        offline_threshold_seconds: 120,
        favorite_limit: 12,
        quick_entry_policy: { favorites: false },
        auto_home_timeout_seconds: 240,
        position_device_thresholds: {
          closed_max: 10,
          opened_min: 90,
        },
      },
      favorites: [
        {
          device_id: "light.kitchen",
          selected: true,
          favorite_order: 2,
        },
      ],
    });

    expect(draft.page.roomLabelMode).toBe("ALWAYS");
    expect(draft.page.homepageDisplayPolicy).toEqual([
      expect.objectContaining({
        key: "show_weather",
        type: "boolean",
        value: "true",
      }),
      expect.objectContaining({
        key: "max_cards",
        type: "number",
        value: "6",
      }),
      expect.objectContaining({
        key: "nested",
        type: "json",
        value: '{\n  "mode": "compact"\n}',
      }),
    ]);
    expect(draft.function).toEqual({
      musicEnabled: true,
      lowBatteryThreshold: "25",
      offlineThresholdSeconds: "120",
      favoriteLimit: "12",
      quickEntryFavorites: false,
      autoHomeTimeoutSeconds: "240",
      closedMax: "10",
      openedMin: "90",
    });
    expect(draft.favorites).toEqual([
      {
        deviceId: "light.kitchen",
        selected: true,
        favoriteOrder: "2",
      },
    ]);
  });

  it("materializes typed policy entries into save payload values", () => {
    expect(
      materializePolicyEntries(
        [
          {
            id: "boolean-entry",
            key: "enabled",
            type: "boolean",
            value: "true",
          },
          {
            id: "number-entry",
            key: "limit",
            type: "number",
            value: "8",
          },
          {
            id: "json-entry",
            key: "layout",
            type: "json",
            value: '{"mode":"dense"}',
          },
          {
            id: "string-entry",
            key: "label",
            type: "string",
            value: "Home",
          },
          {
            id: "empty-key",
            key: " ",
            type: "string",
            value: "ignored",
          },
        ],
        "策略",
      ),
    ).toEqual({
      enabled: true,
      limit: 8,
      layout: { mode: "dense" },
      label: "Home",
    });
  });

  it("throws clear validation errors for invalid policy values", () => {
    expect(() =>
      materializePolicyEntries(
        [{ id: "bad-number", key: "limit", type: "number", value: "NaN" }],
        "策略",
      ),
    ).toThrow('策略 "limit" must be a number.');

    expect(() =>
      materializePolicyEntries(
        [{ id: "bad-json", key: "layout", type: "json", value: "{" }],
        "策略",
      ),
    ).toThrow('策略 "layout" must be valid JSON.');
  });
});
