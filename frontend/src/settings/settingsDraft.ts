import {
  type PolicyEntryDraft,
  type PolicyEntryDraftType,
} from "../components/settings/StructuredPolicyEditor";
import {
  asArray,
  asBoolean,
  asNumber,
  asRecord,
  asString,
} from "../view-models/utils";

export interface SettingsDraftState {
  page: {
    roomLabelMode: string;
    homepageDisplayPolicy: PolicyEntryDraft[];
    iconPolicy: PolicyEntryDraft[];
    layoutPreference: PolicyEntryDraft[];
  };
  function: {
    musicEnabled: boolean;
    lowBatteryThreshold: string;
    offlineThresholdSeconds: string;
    favoriteLimit: string;
    quickEntryFavorites: boolean;
    autoHomeTimeoutSeconds: string;
    closedMax: string;
    openedMin: string;
  };
  favorites: Array<{
    deviceId: string;
    selected: boolean;
    favoriteOrder: string;
  }>;
}

export type SettingsPolicyDraftKey =
  | "homepageDisplayPolicy"
  | "iconPolicy"
  | "layoutPreference";

let policyEntryCounter = 0;

export function nextPolicyEntryId() {
  policyEntryCounter += 1;
  return `policy-entry-${policyEntryCounter}`;
}

function inferPolicyEntryType(value: unknown): PolicyEntryDraftType {
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (typeof value === "number") {
    return "number";
  }
  if (value !== null && typeof value === "object") {
    return "json";
  }
  return "string";
}

export function createPolicyEntries(value: unknown): PolicyEntryDraft[] {
  const record = asRecord(value);
  if (!record) {
    return [];
  }

  return Object.entries(record).map(([key, currentValue]) => {
    const type = inferPolicyEntryType(currentValue);

    return {
      id: nextPolicyEntryId(),
      key,
      type,
      value:
        type === "json"
          ? JSON.stringify(currentValue ?? {}, null, 2)
          : String(currentValue ?? ""),
    };
  });
}

export function materializePolicyEntries(
  entries: PolicyEntryDraft[],
  field: string,
): Record<string, unknown> {
  return entries.reduce<Record<string, unknown>>((result, entry) => {
    const key = entry.key.trim();
    if (!key) {
      return result;
    }

    if (entry.type === "boolean") {
      result[key] = entry.value === "true";
      return result;
    }

    if (entry.type === "number") {
      const parsed = Number(entry.value);
      if (!Number.isFinite(parsed)) {
        throw new Error(`${field} "${key}" must be a number.`);
      }
      result[key] = parsed;
      return result;
    }

    if (entry.type === "json") {
      try {
        result[key] = JSON.parse(entry.value || "{}");
      } catch {
        throw new Error(`${field} "${key}" must be valid JSON.`);
      }
      return result;
    }

    result[key] = entry.value;
    return result;
  }, {});
}

export function createSettingsDraft(
  data: Record<string, unknown> | null,
): SettingsDraftState {
  const page = asRecord(data?.page_settings);
  const functionSettings = asRecord(data?.function_settings);
  const quickEntryPolicy = asRecord(functionSettings?.quick_entry_policy);
  const thresholds = asRecord(functionSettings?.position_device_thresholds);

  return {
    page: {
      roomLabelMode: asString(page?.room_label_mode ?? "EDIT_ONLY"),
      homepageDisplayPolicy: createPolicyEntries(page?.homepage_display_policy),
      iconPolicy: createPolicyEntries(page?.icon_policy),
      layoutPreference: createPolicyEntries(page?.layout_preference),
    },
    function: {
      musicEnabled: asBoolean(functionSettings?.music_enabled),
      lowBatteryThreshold: String(
        asNumber(functionSettings?.low_battery_threshold, 20),
      ),
      offlineThresholdSeconds: String(
        asNumber(functionSettings?.offline_threshold_seconds, 90),
      ),
      favoriteLimit: String(asNumber(functionSettings?.favorite_limit, 8)),
      quickEntryFavorites: asBoolean(quickEntryPolicy?.favorites, true),
      autoHomeTimeoutSeconds: String(
        asNumber(functionSettings?.auto_home_timeout_seconds, 180),
      ),
      closedMax: String(asNumber(thresholds?.closed_max, 5)),
      openedMin: String(asNumber(thresholds?.opened_min, 95)),
    },
    favorites: asArray<Record<string, unknown>>(data?.favorites).map(
      (favorite, index) => ({
        deviceId: asString(favorite.device_id ?? ""),
        selected: asBoolean(favorite.selected, true),
        favoriteOrder: String(asNumber(favorite.favorite_order, index)),
      }),
    ),
  };
}

export function getSettingsVersion(
  data: Record<string, unknown> | null,
): string | null {
  const value = data?.settings_version;
  return typeof value === "string" && value.trim() ? value : null;
}
