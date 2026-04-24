import { describe, expect, it } from "vitest";
import { shouldShowSettingsActionDock } from "../settingsPageUiRules";

describe("settings page UI rules", () => {
  it("shows the settings action dock only for home governance", () => {
    expect(shouldShowSettingsActionDock("home")).toBe(true);
    expect(shouldShowSettingsActionDock("overview")).toBe(false);
    expect(shouldShowSettingsActionDock("integrations")).toBe(false);
    expect(shouldShowSettingsActionDock("terminal")).toBe(false);
    expect(shouldShowSettingsActionDock("backup")).toBe(false);
  });
});
