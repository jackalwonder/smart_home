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

export interface HomeTrendPointViewModel {
  key: string;
  label: string;
  icon: string;
  high: string;
  low: string;
  precipitation: string;
  emphasis?: boolean;
}

export interface HomeRailCardViewModel {
  key: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  metrics: HomeModuleField[];
}

export interface HomeSummaryViewModel {
  onlineCount: number;
  offlineCount: number;
  runningCount: number;
  lightsOnCount: number;
  lowBatteryCount: number;
}

export interface HomeMediaViewModel {
  bindingStatus: string;
  availabilityStatus: string;
  deviceId: string | null;
  displayName: string;
  playState: string;
  trackTitle: string;
  artist: string;
}

export interface HomeEnergyViewModel {
  yesterdayUsage: string;
  monthlyUsage: string;
  balance: string;
  yearlyUsage: string;
  updateLabel: string;
  bindingStatus: string;
  refreshStatus: string;
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
    weatherLocation: string;
    weatherDataStatus: string;
    weatherCondition: string;
    weatherTemperature: string;
    humidity: string;
    precipitation: string;
  };
  summary: HomeSummaryViewModel;
  metrics: HomeMetricViewModel[];
  quickActions: HomeQuickActionViewModel[];
  favoriteDevices: HomeFavoriteDeviceViewModel[];
  showFavoriteDevices: boolean;
  mediaFields: HomeModuleField[];
  energyFields: HomeModuleField[];
  bottomStats: HomeMetricViewModel[];
  weatherTrend: HomeTrendPointViewModel[];
  railCards: HomeRailCardViewModel[];
  media: HomeMediaViewModel;
  energy: HomeEnergyViewModel;
}

function normalizeKeyword(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function formatNumber(value: unknown, fallback = "--") {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return fallback;
}

function formatMetricValue(value: unknown, unit: string, fallback = "--") {
  const normalized = formatNumber(value, fallback);
  return normalized === fallback ? fallback : `${normalized} ${unit}`.trim();
}

function formatEnergyUpdateLabel(value: string | null) {
  if (!value) {
    return "--";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const hour = String(parsed.getHours()).padStart(2, "0");
  const minute = String(parsed.getMinutes()).padStart(2, "0");
  return `${parsed.getMonth() + 1}月${parsed.getDate()}日 ${hour}.${minute}`;
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

function translateWeatherCondition(value: string | null | undefined) {
  const normalized = normalizeKeyword(value);
  const code = Number(value);

  if (Number.isFinite(code)) {
    if (code === 0) {
      return "晴";
    }
    if ([1, 2].includes(code)) {
      return "晴间多云";
    }
    if (code === 3) {
      return "多云";
    }
    if ([45, 48].includes(code)) {
      return "雾";
    }
    if ([51, 53, 55, 56, 57].includes(code)) {
      return "毛毛雨";
    }
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
      return "降雨";
    }
    if ([71, 73, 75, 77, 85, 86].includes(code)) {
      return "降雪";
    }
    if ([95, 96, 99].includes(code)) {
      return "雷雨";
    }
  }

  const map: Record<string, string> = {
    sunny: "晴",
    clear: "晴",
    partlycloudy: "晴间多云",
    cloudy: "多云",
    partly_cloudy: "多云",
    rainy: "降雨",
    rain: "降雨",
    thunderstorm: "雷雨",
    windy: "有风",
    fog: "雾",
    haze: "轻雾",
    snowy: "降雪",
  };

  return map[normalized] ?? (value?.trim() || "天气待更新");
}

function weatherIcon(condition: string) {
  const normalized = normalizeKeyword(condition);
  const code = Number(condition);

  if (Number.isFinite(code)) {
    if ([1, 2, 3, 45, 48].includes(code)) {
      return "☁";
    }
    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code)) {
      return "☔";
    }
    if ([71, 73, 75, 77, 85, 86].includes(code)) {
      return "❄";
    }
    return "☀";
  }

  if (normalized.includes("cloud") || normalized.includes("云")) {
    return "☁";
  }
  if (normalized.includes("rain") || normalized.includes("雨")) {
    return "☔";
  }
  if (normalized.includes("snow") || normalized.includes("雪")) {
    return "❄";
  }
  if (normalized.includes("wind")) {
    return "≈";
  }
  return "☀";
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
    return "温";
  }
  if (source.includes("curtain") || source.includes("cover")) {
    return "帘";
  }
  if (source.includes("sensor")) {
    return "感";
  }
  if (source.includes("media") || source.includes("tv")) {
    return "影";
  }
  if (source.includes("fridge") || source.includes("kitchen")) {
    return "厨";
  }
  return "控";
}

function deviceTypeToLabel(value: string) {
  const normalized = normalizeKeyword(value);
  if (normalized.includes("light") || normalized.includes("lamp")) {
    return "灯光";
  }
  if (normalized.includes("switch")) {
    return "开关";
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
  if (normalized.includes("fridge")) {
    return "冰箱";
  }
  return "设备";
}

function statusToLabel(status: string, isOffline: boolean) {
  if (isOffline) {
    return "离线";
  }

  const normalized = normalizeKeyword(status);
  if (normalized.includes("on") || normalized.includes("open") || normalized.includes("active")) {
    return "已开启";
  }
  if (normalized.includes("running")) {
    return "运行中";
  }
  if (normalized.includes("off") || normalized.includes("closed") || normalized.includes("inactive")) {
    return "已关闭";
  }
  if (normalized.includes("idle")) {
    return "待机";
  }
  if (normalized.includes("paused")) {
    return "暂停";
  }
  return status?.trim() || "状态未知";
}

function entryBehaviorToLabel(value: string) {
  const normalized = normalizeKeyword(value);
  if (normalized.includes("toggle")) {
    return "快速切换";
  }
  if (
    normalized.includes("open_control_card") ||
    normalized.includes("control_card") ||
    normalized.includes("open_panel") ||
    normalized.includes("panel") ||
    normalized.includes("card")
  ) {
    return "打开面板";
  }
  if (normalized.includes("view")) {
    return "查看详情";
  }
  if (normalized.includes("direct")) {
    return "直接操作";
  }
  return value?.trim() || "进入控制";
}

function deriveHotspotTone(
  deviceType: string,
  status: string,
  isOffline: boolean,
): "accent" | "warm" | "neutral" {
  if (isOffline) {
    return "neutral";
  }
  const normalizedStatus = normalizeKeyword(status);
  if (
    normalizedStatus.includes("on") ||
    normalizedStatus.includes("running") ||
    normalizedStatus.includes("open")
  ) {
    return "warm";
  }
  if (normalizeKeyword(deviceType).includes("sensor")) {
    return "accent";
  }
  return "accent";
}

function translateServiceStatus(value: string | null | undefined) {
  const normalized = normalizeKeyword(value);
  const map: Record<string, string> = {
    media_unset: "未配置",
    unbound: "未绑定",
    bound: "已绑定",
    available: "可用",
    unavailable: "不可用",
    idle: "待机",
    playing: "播放中",
    paused: "已暂停",
    success: "已完成",
    pending: "待刷新",
  };
  return map[normalized] ?? (value?.trim() || "-");
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
  const titleMap: Record<string, string> = {
    favorites: "首页入口",
    scene: "快捷场景",
    scenes: "快捷场景",
    media: "媒体控制",
    energy: "能耗概览",
    devices: "设备状态",
  };

  if (Array.isArray(value)) {
    return value
      .map((entry, index) => {
        const record = asRecord(entry);
        const key = asString(record?.key ?? `quick-${index}`);
        return {
          key,
          title: titleMap[normalizeKeyword(key)] ?? asString(record?.title ?? labelize(key)),
          badgeCount: asString(record?.badge_count ?? "可用"),
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
      title: titleMap[normalizeKeyword(key)] ?? labelize(key),
      badgeCount: "可用",
    }));
}

function normalizeFavoriteDevices(value: unknown): HomeFavoriteDeviceViewModel[] {
  return asArray<Record<string, unknown>>(value)
    .map((device, index) => {
      const deviceType = asString(device.device_type ?? "device");
      const status = asString(device.status ?? "unknown");
      const isOffline = asBoolean(device.is_offline);
      return {
        id: asString(device.device_id ?? `favorite-${index}`),
        deviceId: asString(device.device_id ?? ""),
        label: asString(device.display_name ?? device.device_id ?? `设备 ${index + 1}`),
        roomName: asString(device.room_name ?? "未分配房间"),
        deviceType,
        deviceTypeLabel: deviceTypeToLabel(deviceType),
        status,
        statusLabel: statusToLabel(status, isOffline),
        statusSummary: extractStatusSummary(device.status_summary),
        isOffline,
        isComplex: asBoolean(device.is_complex_device),
        isReadonly: asBoolean(device.is_readonly_device),
        entryBehavior: asString(device.entry_behavior ?? "VIEW"),
        entryBehaviorLabel: entryBehaviorToLabel(asString(device.entry_behavior ?? "VIEW")),
        iconGlyph: deriveHotspotGlyph(deviceType, "device"),
        tone: deriveHotspotTone(deviceType, status, isOffline),
        favoriteOrder:
          device.favorite_order === null || device.favorite_order === undefined
            ? null
            : asNumber(device.favorite_order),
      };
    })
    .filter((device) => device.deviceId.length > 0);
}

function makeWeatherTrend(
  temperature: string,
  condition: string,
  forecastValue?: unknown,
): HomeTrendPointViewModel[] {
  const forecast = asArray<Record<string, unknown>>(forecastValue)
    .slice(0, 6)
    .map((point, index) => {
      const date = asString(point.date ?? point.time ?? "");
      const datePart = date.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? date;
      const label =
        index === 0
          ? "今天"
          : index === 1
            ? "明天"
            : datePart
              ? datePart.replace(/^\d{4}-/, "").replace("-", "/")
              : `第 ${index + 1} 天`;
      const rawCondition = asString(point.condition ?? point.weather_code ?? condition);
      return {
        key: date || `forecast-${index}`,
        label,
        icon: weatherIcon(rawCondition),
        high: formatMetricValue(
          point.temperature_max ?? point.high ?? point.max,
          "°",
          "--",
        ).replace(" °", "°"),
        low: formatMetricValue(
          point.temperature_min ?? point.low ?? point.min,
          "°",
          "--",
        ).replace(" °", "°"),
        precipitation: formatMetricValue(
          point.precipitation ?? point.precipitation_sum,
          "mm",
          "0 mm",
        ),
        emphasis: index === 0,
      };
    })
    .filter((point) => point.high !== "--" || point.low !== "--");

  if (forecast.length) {
    return forecast;
  }

  const numericTemperature = Number.parseFloat(temperature);
  const baseline = Number.isFinite(numericTemperature) ? numericTemperature : 24;
  const icon = weatherIcon(condition);

  return [
    {
      key: "today",
      label: "今天",
      icon,
      high: `${Math.round(baseline)}°`,
      low: `${Math.round(baseline - 4)}°`,
      precipitation: "0 mm",
      emphasis: true,
    },
    {
      key: "tomorrow",
      label: "明天",
      icon: "☁",
      high: `${Math.round(baseline - 1)}°`,
      low: `${Math.round(baseline - 5)}°`,
      precipitation: "0 mm",
    },
    {
      key: "d3",
      label: "后天",
      icon: "☔",
      high: `${Math.round(baseline - 2)}°`,
      low: `${Math.round(baseline - 6)}°`,
      precipitation: "0 mm",
    },
    {
      key: "d4",
      label: "周四",
      icon: "☀",
      high: `${Math.round(baseline + 1)}°`,
      low: `${Math.round(baseline - 3)}°`,
      precipitation: "0 mm",
    },
    {
      key: "d5",
      label: "周五",
      icon: "☁",
      high: `${Math.round(baseline)}°`,
      low: `${Math.round(baseline - 4)}°`,
      precipitation: "0 mm",
    },
    {
      key: "d6",
      label: "周六",
      icon: "☀",
      high: `${Math.round(baseline + 2)}°`,
      low: `${Math.round(baseline - 2)}°`,
      precipitation: "0 mm",
    },
  ];
}

function makeRailCards(
  summary: HomeSummaryViewModel,
  favoriteDevices: HomeFavoriteDeviceViewModel[],
  energy: HomeEnergyViewModel,
): HomeRailCardViewModel[] {
  return [
    {
      key: "mode",
      eyebrow: "本屋状态",
      title: summary.offlineCount > 0 ? "需要关注" : "运行平稳",
      subtitle:
        summary.offlineCount > 0
          ? `${summary.offlineCount} 个设备离线，建议现场排查连接和供电。`
          : "主要设备在线，首页可以继续用于日常控制。",
      metrics: [
        { label: "在线", value: String(summary.onlineCount) },
        { label: "运行中", value: String(summary.runningCount) },
        { label: "灯光开启", value: String(summary.lightsOnCount) },
      ],
    },
    {
      key: "favorites",
      eyebrow: "首页入口",
      title: favoriteDevices.length ? `${favoriteDevices.length} 个常用入口` : "等待加入入口",
      subtitle: favoriteDevices.length
        ? "可从设备页继续加入首页，让一线操作更快。"
        : "把最常开的灯光、空调、场景加入首页，现场会更顺手。",
      metrics: favoriteDevices.slice(0, 3).map((device) => ({
        label: device.label,
        value: device.statusSummary ?? device.statusLabel,
      })),
    },
    {
      key: "energy",
      eyebrow: "能耗摘要",
      title: energy.monthlyUsage,
      subtitle: "昨日、本月和年度累计会在这里滚动展示，后续也能替换成你想要的栏目。",
      metrics: [
        { label: "昨日", value: energy.yesterdayUsage },
        { label: "余额", value: energy.balance },
        { label: "年度", value: energy.yearlyUsage },
      ],
    },
  ];
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
    y: 0.3 + Math.min(index, 3) * 0.09,
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
  const summaryRecord = asRecord(sidebar?.summary);
  const weather = asRecord(sidebar?.weather);
  const musicCard = asRecord(sidebar?.music_card);
  const energyRecord = asRecord(value?.energy_bar);
  const timelineRecord = asRecord(sidebar?.datetime);
  const formattedTime = formatDateTime(
    asOptionalString(timelineRecord?.current_time ?? sidebar?.datetime) ?? null,
  );

  const hotspots = asArray<Record<string, unknown>>(stage?.hotspots).map((hotspot, index) => {
    const deviceType = asString(hotspot.device_type ?? "device");
    const status = asString(hotspot.status ?? "unknown");
    const isOffline = asBoolean(hotspot.is_offline);
    return {
      id: asString(hotspot.hotspot_id ?? `hotspot-${index}`),
      deviceId: asString(hotspot.device_id ?? ""),
      label: asString(hotspot.display_name ?? hotspot.device_id ?? `设备 ${index + 1}`),
      deviceType,
      deviceTypeLabel: deviceTypeToLabel(deviceType),
      x: asNumber(hotspot.x),
      y: asNumber(hotspot.y),
      iconGlyph: deriveHotspotGlyph(deviceType, asString(hotspot.icon_type ?? "device")),
      tone: deriveHotspotTone(deviceType, status, isOffline),
      iconType: asString(hotspot.icon_type ?? "device"),
      labelMode: asString(hotspot.label_mode ?? "AUTO"),
      status,
      statusLabel: statusToLabel(status, isOffline),
      statusSummary: extractStatusSummary(hotspot.status_summary),
      isOffline,
      isComplex: asBoolean(hotspot.is_complex_device),
      isReadonly: asBoolean(hotspot.is_readonly_device),
      entryBehavior: asString(hotspot.entry_behavior ?? "VIEW"),
      entryBehaviorLabel: entryBehaviorToLabel(asString(hotspot.entry_behavior ?? "VIEW")),
    };
  });

  const favoriteDevices = normalizeFavoriteDevices(value?.favorite_devices);
  const showFavoriteDevices = shouldShowFavoriteDevices(value);
  const summary: HomeSummaryViewModel = {
    onlineCount: asNumber(summaryRecord?.online_count),
    offlineCount: asNumber(summaryRecord?.offline_count),
    runningCount: asNumber(summaryRecord?.running_device_count),
    lightsOnCount: asNumber(summaryRecord?.lights_on_count),
    lowBatteryCount: asNumber(summaryRecord?.low_battery_count),
  };

  const weatherCondition = translateWeatherCondition(
    asOptionalString(weather?.condition ?? weather?.text),
  );
  const weatherTemperature = formatMetricValue(weather?.temperature, "°C");
  const humidity = formatMetricValue(weather?.humidity, "%");
  const precipitation = formatMetricValue(weather?.precipitation, "mm", "0 mm");
  const weatherLocation = asString(weather?.location_label ?? "本地天气");
  const weatherDataStatus = asBoolean(weather?.cache_mode) ? "过时" : "实时";

  const media: HomeMediaViewModel = {
    bindingStatus: translateServiceStatus(asOptionalString(musicCard?.binding_status)),
    availabilityStatus: translateServiceStatus(asOptionalString(musicCard?.availability_status)),
    deviceId: asOptionalString(musicCard?.device_id),
    displayName: asString(musicCard?.display_name ?? "家庭媒体"),
    playState: translateServiceStatus(asOptionalString(musicCard?.play_state)),
    trackTitle: asString(musicCard?.track_title ?? "暂无播放内容"),
    artist: asString(musicCard?.artist ?? "等待选择播放源"),
  };

  const energy: HomeEnergyViewModel = {
    yesterdayUsage: formatMetricValue(energyRecord?.yesterday_usage, "kWh"),
    monthlyUsage: formatMetricValue(energyRecord?.monthly_usage, "kWh"),
    balance: formatMetricValue(energyRecord?.balance, "元"),
    yearlyUsage: formatMetricValue(energyRecord?.yearly_usage, "kWh"),
    updateLabel: formatEnergyUpdateLabel(asOptionalString(energyRecord?.updated_at)),
    bindingStatus: translateServiceStatus(asOptionalString(energyRecord?.binding_status)),
    refreshStatus: translateServiceStatus(asOptionalString(energyRecord?.refresh_status)),
  };

  return {
    layoutVersion: asString(value?.layout_version ?? "v1"),
    settingsVersion: asString(value?.settings_version ?? "v1"),
    cacheMode: asBoolean(value?.cache_mode),
    stage: {
      backgroundImageUrl: asOptionalString(stage?.background_image_url),
      hotspots,
    },
    timeline: {
      time: formattedTime.time,
      date: formattedTime.date,
      weatherLocation,
      weatherDataStatus,
      weatherCondition,
      weatherTemperature,
      humidity,
      precipitation,
    },
    summary,
    metrics: [
      { label: "在线", value: String(summary.onlineCount) },
      { label: "离线", value: String(summary.offlineCount) },
      { label: "运行中", value: String(summary.runningCount) },
      { label: "灯光开启", value: String(summary.lightsOnCount) },
      { label: "低电量", value: String(summary.lowBatteryCount) },
    ],
    quickActions: normalizeQuickActions(value?.quick_entries),
    favoriteDevices,
    showFavoriteDevices,
    mediaFields: [
      { label: "播放源", value: media.displayName },
      { label: "状态", value: media.playState },
      { label: "曲目", value: media.trackTitle },
      { label: "歌手", value: media.artist },
    ],
    energyFields: [
      { label: "昨日用电", value: energy.yesterdayUsage },
      { label: "本月累计", value: energy.monthlyUsage },
      { label: "账户余额", value: energy.balance },
      { label: "年度累计", value: energy.yearlyUsage },
    ],
    bottomStats: [
      { label: "昨日用电", value: energy.yesterdayUsage },
      { label: "本月累计", value: energy.monthlyUsage },
      { label: "账户余额", value: energy.balance },
      { label: "年度累计", value: energy.yearlyUsage },
      { label: "更新信息", value: energy.updateLabel },
    ],
    weatherTrend: makeWeatherTrend(weatherTemperature, weatherCondition, weather?.forecast),
    railCards: makeRailCards(summary, favoriteDevices, energy),
    media,
    energy,
  };
}
