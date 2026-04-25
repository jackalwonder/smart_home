import { type ImageSize } from "../types/image";

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
  iconAssetId: string | null;
  iconAssetUrl: string | null;
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
  systemUpdateLabel: string;
  sourceUpdateLabel: string;
  bindingStatus: string;
  refreshStatus: string;
}

export interface HomeViewModel {
  layoutVersion: string;
  settingsVersion: string;
  cacheMode: boolean;
  stage: {
    backgroundImageUrl: string | null;
    backgroundImageSize: ImageSize | null;
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
