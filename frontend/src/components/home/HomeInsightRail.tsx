import {
  HomeFavoriteDeviceViewModel,
  HomeMetricViewModel,
  HomeModuleField,
  HomeQuickActionViewModel,
} from "../../view-models/home";
import { DeviceSummaryCard } from "./DeviceSummaryCard";
import { MediaEnergyCard } from "./MediaEnergyCard";
import { QuickSceneCard } from "./QuickSceneCard";
import { TimeWeatherCard } from "./TimeWeatherCard";

interface HomeInsightRailProps {
  time: string;
  date: string;
  weatherTemperature: string;
  weatherCondition: string;
  humidity: string;
  metrics: HomeMetricViewModel[];
  actions: HomeQuickActionViewModel[];
  favoriteDevices: HomeFavoriteDeviceViewModel[];
  showFavoriteDevices: boolean;
  onOpenFavoriteDevice: (deviceId: string) => void;
  mediaFields: HomeModuleField[];
  energyFields: HomeModuleField[];
}

export function HomeInsightRail(props: HomeInsightRailProps) {
  return (
    <aside className="home-insight-rail">
      <TimeWeatherCard
        date={props.date}
        humidity={props.humidity}
        time={props.time}
        weatherCondition={props.weatherCondition}
        weatherTemperature={props.weatherTemperature}
      />
      <DeviceSummaryCard metrics={props.metrics} />
      <QuickSceneCard
        actions={props.actions}
        favoriteDevices={props.favoriteDevices}
        onOpenFavoriteDevice={props.onOpenFavoriteDevice}
        showFavoriteDevices={props.showFavoriteDevices}
      />
      <MediaEnergyCard
        energyFields={props.energyFields}
        mediaFields={props.mediaFields}
      />
    </aside>
  );
}
