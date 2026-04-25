import { useCallback, useState } from "react";
import { normalizeApiError } from "../api/httpClient";
import { fetchSettings, saveSettings } from "../api/settingsApi";
import { DeviceListItemDto } from "../api/types";
import { appStore } from "../store/useAppStore";
import {
  buildNextFavorites,
  buildSettingsSaveInput,
  HomeEntryAction,
  HomeEntryFeedback,
  normalizeFavorites,
} from "./devicesCatalogModel";

interface UseDeviceHomeEntryOptions {
  onCatalogChanged: () => Promise<void>;
}

export function useDeviceHomeEntry({ onCatalogChanged }: UseDeviceHomeEntryOptions) {
  const [homeEntryBusyDeviceId, setHomeEntryBusyDeviceId] = useState<string | null>(null);
  const [homeEntryFeedback, setHomeEntryFeedback] = useState<HomeEntryFeedback>(null);

  const updateHomeEntry = useCallback(
    async (device: DeviceListItemDto, action: HomeEntryAction) => {
      if (action === "add" && !device.is_favorite_candidate) {
        setHomeEntryFeedback({
          tone: "error",
          text: device.favorite_exclude_reason || "当前设备不可加入首页。",
        });
        return;
      }

      setHomeEntryBusyDeviceId(device.device_id);
      setHomeEntryFeedback(null);
      try {
        const settings = await fetchSettings();
        const favorites = normalizeFavorites(settings);
        const alreadySelected = favorites.some(
          (favorite) => favorite.device_id === device.device_id && favorite.selected,
        );

        if (action === "add" && alreadySelected) {
          setHomeEntryFeedback({
            tone: "success",
            text: `${device.display_name} 已在首页，可到设置里调整排序。`,
          });
          return;
        }

        if (action === "remove" && !alreadySelected) {
          setHomeEntryFeedback({
            tone: "success",
            text: `${device.display_name} 当前不在首页。`,
          });
          return;
        }

        const nextFavorites = buildNextFavorites(settings, device.device_id, action);
        await saveSettings(buildSettingsSaveInput(settings, nextFavorites));
        const refreshedSettings = await fetchSettings();
        appStore.setSettingsData(refreshedSettings);
        await onCatalogChanged();
        setHomeEntryFeedback({
          tone: "success",
          text:
            action === "add"
              ? `${device.display_name} 已加入首页，可到设置里调整排序。`
              : `${device.display_name} 已移出首页。`,
        });
      } catch (requestError) {
        setHomeEntryFeedback({
          tone: "error",
          text: normalizeApiError(requestError).message,
        });
      } finally {
        setHomeEntryBusyDeviceId(null);
      }
    },
    [onCatalogChanged],
  );

  return {
    homeEntryBusyDeviceId,
    homeEntryFeedback,
    updateHomeEntry,
  };
}
