import {
  asArray,
  asBoolean,
  asNumber,
  asOptionalString,
  asRecord,
  asString,
  formatDateTime,
  labelize,
} from "./utils";

export interface HomeHotspotViewModel {
  id: string;
  deviceId: string;
  label: string;
  deviceType: string;
  deviceTypeLabel: string;
  x: number;
  y: number;
  iconGlyph: string;
  tone: "accent" | "warm" | "neutral";
  iconType: string;
  labelMode: string;
  status: string;
  statusLabel: string;
  statusSummary: string | null;
  isOffline: boolean;
  isComplex: boolean;
  isReadonly: boolean;
  entryBehavior: string;
  entryBehaviorLabel: string;
}

export interface HomeFavoriteDeviceViewModel {
  id: string;
  deviceId: string;
  label: string;
  roomName: string;
  deviceType: string;
  deviceTypeLabel: string;
  status: string;
  statusLabel: string;
  statusSummary: string | null;
  isOffline: boolean;
  isComplex: boolean;
  isReadonly: boolean;
  entryBehavior: string;
  entryBehaviorLabel: string;
  iconGlyph: string;
  tone: "accent" | "warm" | "neutral";
  favoriteOrder: number | null;
}

export interface HomeQuickActionViewModel {
  key: string;
  title: string;
  badgeCount: string;
}

export interface HomeMetricViewModel {
  label: string;
  value: string;
}

export interface HomeModuleField {
  label: string;
  value: string;
}

export interface HomeViewModel {
  layoutVersion: string;
  settingsVersion: string;
  cacheMode: boolean;
  stage: {
    backgroundImageUrl: string | null;
    hotspots: HomeHotspotViewModel[];
  };
  timeline: {
    time: string;
    date: string;
    weatherCondition: string;
    weatherTemperature: string;
    humidity: string;
  };
  metrics: HomeMetricViewModel[];
  quickActions: HomeQuickActionViewModel[];
  favoriteDevices: HomeFavoriteDeviceViewModel[];
  showFavoriteDevices: boolean;
  mediaFields: HomeModuleField[];
  energyFields: HomeModuleField[];
  bottomStats: HomeMetricViewModel[];
}

function deriveHotspotGlyph(deviceType: string, iconType: string): string {
  const source = `${deviceType} ${iconType}`.toLowerCase();

  if (source.includes("light") || source.includes("lamp")) {
    return "灯";
  }
  if (source.includes("fan")) {
    return "扇";
  }
  if (source.includes("climate") || source.includes("air")) {
    return "空";
  }
  if (source.includes("curtain") || source.includes("cover")) {
    return "帘";
  }
  if (source.includes("sensor")) {
    return "感";
  }
  if (source.includes("media") || source.includes("tv")) {
    return "媒";
  }

  return "控";
}

function deriveHotspotTone(
  deviceType: string,
  status: string,
  isOffline: boolean,
): "accent" | "warm" | "neutral" {
  if (isOffline) {
    return "neutral";
  }

  const statusText = status.toLowerCase();
  if (
    statusText.includes("on") ||
    statusText.includes("running") ||
    statusText.includes("open")
  ) {
    return "warm";
  }

  if (deviceType.toLowerCase().includes("sensor")) {
    return "accent";
  }

  return "accent";
}

function translateStatusLabel(status: string, isOffline: boolean) {
  if (isOffline) {
    return "离线";
  }

  const value = status.toLowerCase();
  if (value.includes("on") || value.includes("open")) {
    return "已开启";
  }
  if (value.includes("running")) {
    return "运行中";
  }
  if (value.includes("off") || value.includes("closed")) {
    return "已关闭";
  }
  if (value.includes("idle")) {
    return "空闲";
  }
  if (value.includes("standby")) {
    return "待机";
  }
  return labelize(status);
}

function translateEntryBehavior(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("view")) {
    return "查看";
  }
  if (normalized.includes("open_panel") || normalized.includes("panel")) {
    return "面板";
  }
  if (normalized.includes("toggle")) {
    return "切换";
  }
  if (normalized.includes("direct")) {
    return "直达";
  }
  return labelize(value);
}

function translateServiceStatus(value: string) {
  switch (value) {
    case "MEDIA_UNSET":
    case "UNBOUND":
      return "待绑定";
    case "BOUND":
      return "已绑定";
    case "AVAILABLE":
      return "可用";
    case "UNAVAILABLE":
      return "不可用";
    case "IDLE":
      return "空闲";
    case "PLAYING":
      return "播放中";
    case "PAUSED":
      return "已暂停";
    default:
      return value;
  }
}

function translateDeviceType(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("light") || normalized.includes("lamp")) {
    return "灯光";
  }
  if (normalized.includes("fan")) {
    return "风扇";
  }
  if (normalized.includes("climate") || normalized.includes("air")) {
    return "空调";
  }
  if (normalized.includes("cover") || normalized.includes("curtain")) {
    return "窗帘";
  }
  if (normalized.includes("sensor")) {
    return "传感器";
  }
  if (normalized.includes("media") || normalized.includes("tv")) {
    return "媒体";
  }
  return "设备";
}

function extractStatusSummary(value: unknown) {
  const record = asRecord(value);
  return (
    asOptionalString(record?.primary) ??
    asOptionalString(record?.state) ??
    asOptionalString(record?.text) ??
    asOptionalString(value)
  );
}

function isPolicyEnabled(
  value: Record<string, unknown> | null,
  key: string,
  fallback = true,
) {
  if (!value || !(key in value)) {
    return fallback;
  }

  const raw = value[key];
  if (typeof raw === "string") {
    return !["false", "0", "off", "disabled"].includes(raw.toLowerCase());
  }
  return raw !== false;
}

function shouldShowFavoriteDevices(value: Record<string, unknown> | null) {
  const uiPolicy = asRecord(value?.ui_policy);
  const homepageDisplayPolicy = asRecord(uiPolicy?.homepage_display_policy);
  const quickEntries = asRecord(value?.quick_entries);

  return (
    isPolicyEnabled(homepageDisplayPolicy, "show_favorites") &&
    isPolicyEnabled(quickEntries, "favorites")
  );
}

function normalizeQuickActions(value: unknown): HomeQuickActionViewModel[] {
  function translateQuickActionTitle(input: string) {
    const normalized = input.toLowerCase();
    if (normalized.includes("favorite")) {
      return "首页常用";
    }
    if (normalized.includes("scene")) {
      return "场景入口";
    }
    if (normalized.includes("media")) {
      return "媒体控制";
    }
    if (normalized.includes("energy")) {
      return "能耗概览";
    }
    return labelize(input);
  }

  if (Array.isArray(value)) {
    return value
      .map((entry, index) => {
        const record = asRecord(entry);
        return {
          key: asString(record?.key ?? `quick-${index}`),
          title: translateQuickActionTitle(
            asString(record?.title ?? record?.key ?? `快捷 ${index + 1}`),
          ),
          badgeCount: asString(record?.badge_count ?? "待命")
            .replace("Ready", "待命")
            .replace("Active", "可用"),
        };
      })
      .filter((action) => action.key !== "favorites");
  }

  const record = asRecord(value);
  if (!record) {
    return [];
  }

  return Object.entries(record)
    .filter(([key, enabled]) => key !== "favorites" && Boolean(enabled))
    .map(([key]) => ({
      key,
      title: translateQuickActionTitle(key),
      badgeCount: "可用",
    }));
}

function normalizeFavoriteDevices(
  value: unknown,
): HomeFavoriteDeviceViewModel[] {
  return asArray<Record<string, unknown>>(value)
    .map((device, index) => {
      const deviceType = asString(device.device_type ?? "device");
      const status = asString(device.status ?? "unknown");
      const isOffline = asBoolean(device.is_offline);
      const iconGlyph = deriveHotspotGlyph(deviceType, "device");

      return {
        id: asString(device.device_id ?? `favorite-${index}`),
        deviceId: asString(device.device_id ?? ""),
        label: asString(
          device.display_name ?? device.device_id ?? `设备 ${index + 1}`,
        ),
        roomName: asString(device.room_name ?? "未分配房间"),
        deviceType,
        deviceTypeLabel: translateDeviceType(deviceType),
        status,
        statusLabel: translateStatusLabel(status, isOffline),
        statusSummary: extractStatusSummary(device.status_summary),
        isOffline,
        isComplex: asBoolean(device.is_complex_device),
        isReadonly: asBoolean(device.is_readonly_device),
        entryBehavior: asString(device.entry_behavior ?? "VIEW"),
        entryBehaviorLabel: translateEntryBehavior(
          asString(device.entry_behavior ?? "VIEW"),
        ),
        iconGlyph,
        tone: deriveHotspotTone(deviceType, status, isOffline),
        favoriteOrder:
          device.favorite_order === null || device.favorite_order === undefined
            ? null
            : asNumber(device.favorite_order),
      };
    })
    .filter((device) => device.deviceId.length > 0);
}

export function homeFavoriteDeviceToHotspot(
  device: HomeFavoriteDeviceViewModel,
  index = 0,
): HomeHotspotViewModel {
  return {
    id: `favorite-${device.deviceId}`,
    deviceId: device.deviceId,
    label: device.label,
    deviceType: device.deviceType,
    deviceTypeLabel: device.deviceTypeLabel,
    x: 0.72,
    y: 0.32 + Math.min(index, 3) * 0.08,
    iconGlyph: device.iconGlyph,
    tone: device.tone,
    iconType: "device",
    labelMode: "ALWAYS",
    status: device.status,
    statusLabel: device.statusLabel,
    statusSummary: device.statusSummary,
    isOffline: device.isOffline,
    isComplex: device.isComplex,
    isReadonly: device.isReadonly,
    entryBehavior: device.entryBehavior,
    entryBehaviorLabel: device.entryBehaviorLabel,
  };
}

export function mapHomeOverviewViewModel(
  value: Record<string, unknown> | null,
): HomeViewModel {
  const stage = asRecord(value?.stage);
  const sidebar = asRecord(value?.sidebar);
  const summary = asRecord(sidebar?.summary);
  const weather = asRecord(sidebar?.weather);
  const musicCard = asRecord(sidebar?.music_card);
  const energy = asRecord(value?.energy_bar);
  const timeline = asRecord(sidebar?.datetime);
  const formattedTime = formatDateTime(
    asOptionalString(timeline?.current_time ?? sidebar?.datetime) ?? null,
  );

  const hotspots = asArray<Record<string, unknown>>(stage?.hotspots).map(
    (hotspot, index) => ({
      id: asString(hotspot.hotspot_id ?? `hotspot-${index}`),
      deviceId: asString(hotspot.device_id ?? ""),
      label: asString(
        hotspot.display_name ?? hotspot.device_id ?? `设备 ${index + 1}`,
      ),
      deviceType: asString(hotspot.device_type ?? "device"),
      deviceTypeLabel: translateDeviceType(
        asString(hotspot.device_type ?? "device"),
      ),
      x: asNumber(hotspot.x),
      y: asNumber(hotspot.y),
      iconGlyph: deriveHotspotGlyph(
        asString(hotspot.device_type ?? "device"),
        asString(hotspot.icon_type ?? "device"),
      ),
      tone: deriveHotspotTone(
        asString(hotspot.device_type ?? "device"),
        asString(hotspot.status ?? "unknown"),
        asBoolean(hotspot.is_offline),
      ),
      iconType: asString(hotspot.icon_type ?? "device"),
      labelMode: asString(
        hotspot.label_mode ?? hotspot.display_policy ?? "AUTO",
      ),
      status: asString(hotspot.status ?? "unknown"),
      statusLabel: translateStatusLabel(
        asString(hotspot.status ?? "unknown"),
        asBoolean(hotspot.is_offline),
      ),
      statusSummary: asOptionalString(hotspot.status_summary),
      isOffline: asBoolean(hotspot.is_offline),
      isComplex: asBoolean(hotspot.is_complex_device),
      isReadonly: asBoolean(hotspot.is_readonly_device),
      entryBehavior: asString(hotspot.entry_behavior ?? "VIEW"),
      entryBehaviorLabel: translateEntryBehavior(
        asString(hotspot.entry_behavior ?? "VIEW"),
      ),
    }),
  );

  const favoriteDevices = normalizeFavoriteDevices(value?.favorite_devices);

  return {
    layoutVersion: asString(value?.layout_version ?? "layout_v1"),
    settingsVersion: asString(value?.settings_version ?? "settings_v1"),
    cacheMode: asBoolean(value?.cache_mode),
    stage: {
      backgroundImageUrl: asOptionalString(stage?.background_image_url),
      hotspots,
    },
    timeline: {
      time: formattedTime.time,
      date: formattedTime.date,
      weatherCondition: asString(
        weather?.condition ?? weather?.text ?? "暂无天气",
      ),
      weatherTemperature: asString(weather?.temperature ?? "--"),
      humidity: asString(weather?.humidity ?? "--"),
    },
    metrics: [
      { label: "在线", value: asString(summary?.online_count ?? 0) },
      { label: "离线", value: asString(summary?.offline_count ?? 0) },
      { label: "亮灯", value: asString(summary?.lights_on_count ?? 0) },
      { label: "运行中", value: asString(summary?.running_device_count ?? 0) },
      { label: "低电量", value: asString(summary?.low_battery_count ?? 0) },
    ],
    quickActions: normalizeQuickActions(value?.quick_entries),
    favoriteDevices,
    showFavoriteDevices: shouldShowFavoriteDevices(value),
    mediaFields: [
      {
        label: "绑定状态",
        value: translateServiceStatus(
          asString(musicCard?.binding_status ?? "MEDIA_UNSET"),
        ),
      },
      {
        label: "可用性",
        value: translateServiceStatus(
          asString(musicCard?.availability_status ?? "-"),
        ),
      },
      { label: "设备", value: asString(musicCard?.display_name ?? "-") },
      {
        label: "播放状态",
        value: translateServiceStatus(asString(musicCard?.play_state ?? "-")),
      },
      { label: "曲目", value: asString(musicCard?.track_title ?? "-") },
      { label: "歌手", value: asString(musicCard?.artist ?? "-") },
    ],
    energyFields: [
      {
        label: "绑定状态",
        value: translateServiceStatus(asString(energy?.binding_status ?? "-")),
      },
      {
        label: "刷新状态",
        value: translateServiceStatus(asString(energy?.refresh_status ?? "-")),
      },
      { label: "本月用量", value: asString(energy?.monthly_usage ?? "-") },
      { label: "剩余金额", value: asString(energy?.balance ?? "-") },
    ],
    bottomStats: [
      { label: "热点", value: String(hotspots.length) },
      { label: "天气", value: asString(weather?.temperature ?? "--") },
      { label: "模式", value: asBoolean(value?.cache_mode) ? "缓存" : "实时" },
    ],
  };
}
