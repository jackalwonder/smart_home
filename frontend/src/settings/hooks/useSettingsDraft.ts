import { useEffect, useState } from "react";
import { saveSettings } from "../../api/settingsApi";
import { normalizeApiError } from "../../api/httpClient";
import { appStore } from "../../store/useAppStore";
import type { PolicyEntryDraftType } from "../../components/settings/StructuredPolicyEditor";
import {
  createSettingsDraft,
  getSettingsVersion,
  materializePolicyEntries,
  nextPolicyEntryId,
  type SettingsPolicyDraftKey,
} from "../settingsDraft";

interface UseSettingsDraftOptions {
  onSaved: () => Promise<void>;
  settingsData: Record<string, unknown> | null;
  terminalId?: string | null;
}

export function useSettingsDraft({
  onSaved,
  settingsData,
  terminalId,
}: UseSettingsDraftOptions) {
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState(() =>
    createSettingsDraft(null),
  );
  const [draftSourceSettingsVersion, setDraftSourceSettingsVersion] = useState<
    string | null
  >(null);

  function applySettingsDraftFromData(data: Record<string, unknown>) {
    setSettingsDraft(createSettingsDraft(data));
    setDraftSourceSettingsVersion(getSettingsVersion(data));
  }

  useEffect(() => {
    const nextVersion = getSettingsVersion(settingsData);
    if (
      !settingsData ||
      !nextVersion ||
      nextVersion === draftSourceSettingsVersion ||
      isSaving
    ) {
      return;
    }
    applySettingsDraftFromData(settingsData);
  }, [draftSourceSettingsVersion, isSaving, settingsData]);

  function updatePageDraft(field: "roomLabelMode", value: string) {
    setSettingsDraft((current) => ({
      ...current,
      page: { ...current.page, [field]: value },
    }));
  }

  function updateFunctionDraft(
    field:
      | "musicEnabled"
      | "lowBatteryThreshold"
      | "offlineThresholdSeconds"
      | "favoriteLimit"
      | "quickEntryFavorites"
      | "autoHomeTimeoutSeconds"
      | "closedMax"
      | "openedMin",
    value: string | boolean,
  ) {
    setSettingsDraft((current) => ({
      ...current,
      function: { ...current.function, [field]: value },
    }));
  }

  function updateFavoriteDraft(
    index: number,
    field: "deviceId" | "selected" | "favoriteOrder",
    value: string | boolean,
  ) {
    setSettingsDraft((current) => ({
      ...current,
      favorites: current.favorites.map((favorite, favoriteIndex) =>
        favoriteIndex === index ? { ...favorite, [field]: value } : favorite,
      ),
    }));
  }

  function addFavoriteDraft() {
    setSettingsDraft((current) => ({
      ...current,
      favorites: [
        ...current.favorites,
        {
          deviceId: "",
          selected: true,
          favoriteOrder: String(current.favorites.length),
        },
      ],
    }));
  }

  function removeFavoriteDraft(index: number) {
    setSettingsDraft((current) => ({
      ...current,
      favorites: current.favorites.filter(
        (_, favoriteIndex) => favoriteIndex !== index,
      ),
    }));
  }

  function updatePolicyDraft(
    policy: SettingsPolicyDraftKey,
    index: number,
    field: "key" | "type" | "value",
    value: string,
  ) {
    setSettingsDraft((current) => ({
      ...current,
      page: {
        ...current.page,
        [policy]: current.page[policy].map((entry, entryIndex) => {
          if (entryIndex !== index) {
            return entry;
          }

          if (field === "type") {
            return {
              ...entry,
              type: value as PolicyEntryDraftType,
              value:
                value === "boolean"
                  ? "false"
                  : value === "json"
                    ? entry.type === "json"
                      ? entry.value
                      : "{}"
                    : entry.type === "boolean"
                      ? ""
                      : entry.value,
            };
          }

          return { ...entry, [field]: value };
        }),
      },
    }));
  }

  function addPolicyDraft(policy: SettingsPolicyDraftKey) {
    setSettingsDraft((current) => ({
      ...current,
      page: {
        ...current.page,
        [policy]: [
          ...current.page[policy],
          {
            id: nextPolicyEntryId(),
            key: "",
            type: "string",
            value: "",
          },
        ],
      },
    }));
  }

  function removePolicyDraft(policy: SettingsPolicyDraftKey, index: number) {
    setSettingsDraft((current) => ({
      ...current,
      page: {
        ...current.page,
        [policy]: current.page[policy].filter(
          (_, entryIndex) => entryIndex !== index,
        ),
      },
    }));
  }

  function upsertPolicyDraft(
    policy: SettingsPolicyDraftKey,
    key: string,
    type: PolicyEntryDraftType,
    value: string,
  ) {
    setSettingsDraft((current) => {
      const currentEntries = current.page[policy];
      const existingIndex = currentEntries.findIndex((entry) => entry.key === key);
      const nextEntry =
        existingIndex >= 0
          ? { ...currentEntries[existingIndex], type, value }
          : { id: nextPolicyEntryId(), key, type, value };

      return {
        ...current,
        page: {
          ...current.page,
          [policy]:
            existingIndex >= 0
              ? currentEntries.map((entry, index) =>
                  index === existingIndex ? nextEntry : entry,
                )
              : [...currentEntries, nextEntry],
        },
      };
    });
  }

  async function handleSave() {
    if (!settingsData || !terminalId) {
      return;
    }

    setSaveMessage(null);
    setIsSaving(true);
    try {
      const response = await saveSettings({
        settings_version:
          (settingsData.settings_version as string | null | undefined) ?? null,
        page_settings: {
          room_label_mode: settingsDraft.page.roomLabelMode,
          homepage_display_policy: materializePolicyEntries(
            settingsDraft.page.homepageDisplayPolicy,
            "首页展示策略",
          ),
          icon_policy: materializePolicyEntries(
            settingsDraft.page.iconPolicy,
            "图标策略",
          ),
          layout_preference: materializePolicyEntries(
            settingsDraft.page.layoutPreference,
            "布局偏好",
          ),
        },
        function_settings: {
          music_enabled: settingsDraft.function.musicEnabled,
          low_battery_threshold: Number(
            settingsDraft.function.lowBatteryThreshold,
          ),
          offline_threshold_seconds: Number(
            settingsDraft.function.offlineThresholdSeconds,
          ),
          favorite_limit: Number(settingsDraft.function.favoriteLimit),
          quick_entry_policy: {
            favorites: settingsDraft.function.quickEntryFavorites,
          },
          auto_home_timeout_seconds: Number(
            settingsDraft.function.autoHomeTimeoutSeconds,
          ),
          position_device_thresholds: {
            closed_max: Number(settingsDraft.function.closedMax),
            opened_min: Number(settingsDraft.function.openedMin),
          },
        },
        favorites: settingsDraft.favorites
          .filter((favorite) => favorite.deviceId.trim())
          .map((favorite, index) => ({
            device_id: favorite.deviceId.trim(),
            selected: favorite.selected,
            favorite_order: favorite.favoriteOrder.trim()
              ? Number(favorite.favoriteOrder)
              : index,
          })),
      });
      setSaveMessage(
        `保存完成，settings_version 已更新为 ${response.settings_version}。`,
      );
      await onSaved();
    } catch (error) {
      appStore.setSettingsError(normalizeApiError(error).message);
    } finally {
      setIsSaving(false);
    }
  }

  return {
    addFavoriteDraft,
    addPolicyDraft,
    applySettingsDraftFromData,
    handleSave,
    isSaving,
    removeFavoriteDraft,
    removePolicyDraft,
    saveMessage,
    settingsDraft,
    updateFavoriteDraft,
    updateFunctionDraft,
    updatePageDraft,
    updatePolicyDraft,
    upsertPolicyDraft,
  };
}
