import { describe, expect, it } from "vitest";
import { normalizeSettingsSectionKey } from "../SettingsOperationsWorkflow";
import { mapSettingsViewModel } from "../../../view-models/settings";

describe("settings navigation", () => {
  it("uses task-oriented settings sections", () => {
    expect(mapSettingsViewModel(null).sections.map((section) => section.key)).toEqual([
      "overview",
      "integrations",
      "home",
      "terminal",
      "backup",
    ]);
  });

  it("normalizes legacy section query values", () => {
    expect(normalizeSettingsSectionKey(null)).toBe("overview");
    expect(normalizeSettingsSectionKey("system")).toBe("integrations");
    expect(normalizeSettingsSectionKey("delivery")).toBe("terminal");
    expect(normalizeSettingsSectionKey("favorites")).toBe("home");
    expect(normalizeSettingsSectionKey("unknown")).toBe("overview");
  });
});
