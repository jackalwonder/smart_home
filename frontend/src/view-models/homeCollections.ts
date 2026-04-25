import { asArray, asBoolean, asNumber, asString, labelize } from "./utils";
import {
  deriveHotspotGlyph,
  deriveHotspotTone,
  deviceTypeToLabel,
  entryBehaviorToLabel,
  extractStatusSummary,
  formatMetricValue,
  normalizeKeyword,
  statusToLabel,
  weatherIcon,
} from "./homeFormatters";
import {
  HomeEnergyViewModel,
  HomeFavoriteDeviceViewModel,
  HomeHotspotViewModel,
  HomeQuickActionViewModel,
  HomeRailCardViewModel,
  HomeSummaryViewModel,
  HomeTrendPointViewModel,
} from "./homeTypes";

export function normalizeQuickActions(value: unknown): HomeQuickActionViewModel[] {
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
        const record =
          entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null;
        const key = asString(record?.key ?? `quick-${index}`);
        return {
          key,
          title: titleMap[normalizeKeyword(key)] ?? asString(record?.title ?? labelize(key)),
          badgeCount: asString(record?.badge_count ?? "可用"),
        };
      })
      .filter((action) => action.key !== "favorites");
  }

  const record =
    value && typeof value === "object" ? (value as Record<string, unknown>) : null;
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

export function normalizeFavoriteDevices(value: unknown): HomeFavoriteDeviceViewModel[] {
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

export function makeWeatherTrend(
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

export function makeRailCards(
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
      title: energy.bindingStatus === "已绑定" ? energy.monthlyUsage : "等待绑定",
      subtitle:
        energy.bindingStatus === "已绑定"
          ? `来源更新时间 ${energy.sourceUpdateLabel}，刷新状态 ${energy.refreshStatus}。`
          : "到设置页的接入配置绑定国网能耗账号后，这里会展示用电和余额。",
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
    iconAssetId: null,
    iconAssetUrl: null,
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
