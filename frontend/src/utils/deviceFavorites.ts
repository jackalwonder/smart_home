import type { SettingsDto, SettingsSaveInput } from "../api/types";

export function normalizeFavorites(settings: SettingsDto): SettingsSaveInput["favorites"] {
  return (settings.favorites ?? []).map((favorite, index) => ({
    device_id: favorite.device_id,
    selected: favorite.selected ?? true,
    favorite_order:
      typeof favorite.favorite_order === "number" ? favorite.favorite_order : index,
  }));
}

export function getNextFavoriteOrder(favorites: SettingsSaveInput["favorites"]) {
  const orders = favorites
    .map((favorite, index) =>
      typeof favorite.favorite_order === "number" ? favorite.favorite_order : index,
    )
    .filter((order) => Number.isFinite(order));
  return orders.length ? Math.max(...orders) + 1 : 0;
}

export function buildSettingsSaveInput(
  settings: SettingsDto,
  favorites: SettingsSaveInput["favorites"],
): SettingsSaveInput {
  const pageSettings = settings.page_settings;
  const functionSettings = settings.function_settings;

  return {
    settings_version: settings.settings_version ?? null,
    page_settings: {
      room_label_mode: pageSettings?.room_label_mode ?? "ROOM_NAME",
      homepage_display_policy: pageSettings?.homepage_display_policy ?? {},
      icon_policy: pageSettings?.icon_policy ?? {},
      layout_preference: pageSettings?.layout_preference ?? {},
    },
    function_settings: {
      low_battery_threshold: functionSettings?.low_battery_threshold ?? 20,
      offline_threshold_seconds: functionSettings?.offline_threshold_seconds ?? 300,
      quick_entry_policy: functionSettings?.quick_entry_policy ?? {
        favorites: true,
      },
      music_enabled: functionSettings?.music_enabled ?? true,
      favorite_limit: functionSettings?.favorite_limit ?? 8,
      auto_home_timeout_seconds: functionSettings?.auto_home_timeout_seconds ?? 30,
      position_device_thresholds: functionSettings?.position_device_thresholds ?? {},
    },
    favorites,
  };
}

export function buildNextFavorites(
  settings: SettingsDto,
  deviceId: string,
  action: "add" | "remove",
) {
  const favorites = normalizeFavorites(settings).filter(
    (favorite) => favorite.device_id !== deviceId,
  );

  if (action === "remove") {
    return favorites;
  }

  return [
    ...favorites,
    {
      device_id: deviceId,
      selected: true,
      favorite_order: getNextFavoriteOrder(favorites),
    },
  ];
}
