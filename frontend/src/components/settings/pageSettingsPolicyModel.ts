import { PolicyEntryDraft } from "./StructuredPolicyEditor";

export type PolicyKey = "homepageDisplayPolicy" | "iconPolicy" | "layoutPreference";

export const knownHomepageKeys = [
  "show_weather",
  "show_energy",
  "show_media",
  "show_favorites",
  "stage_density",
  "spotlight_room",
] as const;

export const knownIconKeys = [
  "use_device_icon",
  "highlight_active_devices",
  "icon_theme",
  "active_glow_color",
  "sensor_tone_color",
  "fallback_icon",
] as const;

export const knownLayoutKeys = [
  "default_floor",
  "sidebar_mode",
  "hotspot_scale",
  "stage_zoom",
  "show_grid_overlay",
  "animation_level",
] as const;

export function findEntry(entries: PolicyEntryDraft[], key: string) {
  return entries.find((entry) => entry.key === key) ?? null;
}

export function getBoolean(entries: PolicyEntryDraft[], key: string, fallback = false) {
  const entry = findEntry(entries, key);
  if (!entry) {
    return fallback;
  }
  return entry.value === "true";
}

export function getString(entries: PolicyEntryDraft[], key: string, fallback = "") {
  return findEntry(entries, key)?.value ?? fallback;
}

export function getUnknownEntries(entries: PolicyEntryDraft[], knownKeys: readonly string[]) {
  return entries.filter((entry) => !knownKeys.includes(entry.key));
}

export function findOriginalIndex(entries: PolicyEntryDraft[], entryId: string) {
  return entries.findIndex((entry) => entry.id === entryId);
}
