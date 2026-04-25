import { resolveHotspotIconUrl } from "../api/pageAssetsApi";
import { asArray, asBoolean, asNumber, asOptionalString, asRecord, asString, formatDateTime } from "./utils";
import {
  deriveHotspotGlyph,
  deriveHotspotTone,
  deviceTypeToLabel,
  entryBehaviorToLabel,
  extractStatusSummary,
  formatEnergyUpdateLabel,
  formatMetricValue,
  parseImageSize,
  shouldShowFavoriteDevices,
  statusToLabel,
  translateServiceStatus,
  translateWeatherCondition,
} from "./homeFormatters";
import {
  makeRailCards,
  makeWeatherTrend,
  normalizeFavoriteDevices,
  normalizeQuickActions,
} from "./homeCollections";
import {
  HomeEnergyViewModel,
  HomeMediaViewModel,
  HomeSummaryViewModel,
  HomeViewModel,
} from "./homeTypes";

export type * from "./homeTypes";
export { homeFavoriteDeviceToHotspot } from "./homeCollections";

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
      iconAssetId: asOptionalString(hotspot.icon_asset_id),
      iconAssetUrl: resolveHotspotIconUrl(
        asOptionalString(hotspot.icon_asset_url) ?? asOptionalString(hotspot.icon_asset_id),
      ),
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
    systemUpdateLabel: formatEnergyUpdateLabel(asOptionalString(energyRecord?.updated_at)),
    sourceUpdateLabel: formatEnergyUpdateLabel(
      asOptionalString(energyRecord?.source_updated_at),
    ),
    bindingStatus: translateServiceStatus(asOptionalString(energyRecord?.binding_status)),
    refreshStatus: translateServiceStatus(asOptionalString(energyRecord?.refresh_status)),
  };

  return {
    layoutVersion: asString(value?.layout_version ?? "v1"),
    settingsVersion: asString(value?.settings_version ?? "v1"),
    cacheMode: asBoolean(value?.cache_mode),
    stage: {
      backgroundImageUrl: asOptionalString(stage?.background_image_url),
      backgroundImageSize: parseImageSize(stage?.background_image_size),
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
      { label: "状态", value: media.playState },
      { label: "播放源", value: media.displayName },
      { label: "曲目", value: media.trackTitle },
      { label: "歌手", value: media.artist },
    ],
    energyFields: [
      { label: "状态", value: energy.bindingStatus },
      { label: "本月累计", value: energy.monthlyUsage },
      { label: "账户余额", value: energy.balance },
      { label: "HA 源更新", value: energy.sourceUpdateLabel },
      { label: "刷新状态", value: energy.refreshStatus },
      { label: "昨日用电", value: energy.yesterdayUsage },
      { label: "年度累计", value: energy.yearlyUsage },
    ],
    bottomStats: [
      { label: "昨日用电", value: energy.yesterdayUsage },
      { label: "本月累计", value: energy.monthlyUsage },
      { label: "账户余额", value: energy.balance },
      { label: "年度累计", value: energy.yearlyUsage },
    ],
    weatherTrend: makeWeatherTrend(weatherTemperature, weatherCondition, weather?.forecast),
    railCards: makeRailCards(summary, favoriteDevices, energy),
    media,
    energy,
  };
}
