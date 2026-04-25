import { describe, expect, it } from "vitest";
import type { DeviceControlSchemaItemDto, DeviceListItemDto } from "../../../api/types";
import type { HomeViewModel } from "../../../view-models/home";
import {
  filterClusterDevices,
  formatOptionLabel as formatClusterOptionLabel,
  getInitialValue as getClusterInitialValue,
  isBrightnessSchema,
  isPowerSchema,
  modalTitle,
} from "../homeClusterControlModel";
import {
  describeAction,
  formatOptionLabel,
  getInitialValue,
  normalizeControlValue,
} from "../homeDeviceControlModel";
import { buildInsightCounts, buildMediaSources, weatherGlyph } from "../homeInsightRailModel";

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
    is_favorite: input.is_favorite ?? false,
    is_favorite_candidate: input.is_favorite_candidate ?? true,
    is_homepage_visible: input.is_homepage_visible ?? true,
    is_primary_device: input.is_primary_device ?? false,
    alert_badges: input.alert_badges ?? [],
  };
}

function viewModel(input: Partial<HomeViewModel> = {}): HomeViewModel {
  return {
    layoutVersion: "v1",
    settingsVersion: "v1",
    cacheMode: false,
    stage: {
      backgroundImageUrl: null,
      backgroundImageSize: null,
      hotspots: [],
    },
    summary: {
      onlineCount: 4,
      lightsOnCount: 2,
      offlineCount: 1,
      runningCount: 0,
      lowBatteryCount: 3,
    },
    timeline: {
      date: "4月26日 星期日",
      time: "10:00",
      weatherCondition: "多云",
      weatherLocation: "上海",
      weatherDataStatus: "实时",
      weatherTemperature: "22 °C",
      humidity: "66%",
      precipitation: "1.2",
    },
    media: {
      bindingStatus: input.media?.bindingStatus ?? "未配置",
      deviceId: input.media?.deviceId ?? null,
      displayName: input.media?.displayName ?? "默认媒体",
      playState: input.media?.playState ?? "待机",
      trackTitle: input.media?.trackTitle ?? "未配置播放设备",
      artist: input.media?.artist ?? "到设置页选择默认播放器",
      availabilityStatus: input.media?.availabilityStatus ?? "在线",
    },
    energy: {
      yesterdayUsage: "0 kWh",
      monthlyUsage: "0 kWh",
      balance: "0 元",
      yearlyUsage: "0 kWh",
      systemUpdateLabel: "暂无",
      sourceUpdateLabel: "暂无",
      bindingStatus: "未配置",
      refreshStatus: "待刷新",
    },
    metrics: [],
    quickActions: [],
    favoriteDevices: [],
    showFavoriteDevices: false,
    mediaFields: [],
    energyFields: [],
    bottomStats: [],
    weatherTrend: [],
    railCards: [],
    ...input,
  };
}

describe("home device and rail models", () => {
  it("maps device control schemas to labels and payload values", () => {
    const temperature = schema({
      action_type: "set_temperature",
      target_key: "target_temperature",
      value_type: "NUMBER",
      value_range: { min: 16, max: 30, step: 1 },
      unit: "°C",
    });

    expect(describeAction(temperature)).toEqual({
      title: "温度",
      valueLabel: "目标温度",
      submitText: "应用温度",
    });
    expect(getInitialValue(temperature)).toBe(16);
    expect(normalizeControlValue(temperature, "24")).toBe(24);
    expect(formatOptionLabel("cool")).toBe("制冷");
  });

  it("filters cluster devices and recognizes common control schemas", () => {
    const devices = [
      device({ device_id: "light-1", device_type: "light" }),
      device({ device_id: "climate-1", device_type: "climate" }),
      device({ device_id: "offline-1", device_type: "sensor", is_offline: true }),
      device({
        device_id: "battery-1",
        device_type: "sensor",
        alert_badges: [{ code: "LOW_BATTERY", level: "warning", text: "低电量" }],
      }),
    ];

    expect(filterClusterDevices("lights", devices).map((item) => item.device_id)).toEqual([
      "light-1",
    ]);
    expect(filterClusterDevices("offline", devices).map((item) => item.device_id)).toEqual([
      "offline-1",
    ]);
    expect(isPowerSchema(schema({ action_type: "toggle_power" }))).toBe(true);
    expect(isBrightnessSchema(schema({ target_key: "brightness" }))).toBe(true);
    expect(getClusterInitialValue(schema({ allowed_values: ["auto", "cool"] }))).toBe("auto");
    expect(formatClusterOptionLabel("eco")).toBe("节能");
    expect(modalTitle("battery")).toBe("低电量设备");
  });

  it("builds rail counts and media sources without component state", () => {
    const devices = [
      device({ device_id: "light-1", device_type: "light", is_offline: false }),
      device({ device_id: "climate-1", device_type: "climate", is_offline: false }),
      device({ device_id: "media-1", device_type: "media_player", display_name: "客厅音箱" }),
      device({ device_id: "offline-1", device_type: "switch", is_offline: true }),
    ];

    expect(buildInsightCounts(viewModel(), devices)).toEqual({
      lights: 1,
      climate: 1,
      battery: 3,
      offline: 1,
    });
    expect(buildMediaSources(viewModel(), devices)[0]).toMatchObject({
      key: "media-1",
      source: "客厅音箱",
    });
    expect(buildMediaSources(viewModel(), []).at(0)?.isPlaceholder).toBe(true);
    expect(weatherGlyph("light rain")).toBe("☔");
  });
});
