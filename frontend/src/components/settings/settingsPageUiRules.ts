import type { SettingsSectionViewModel } from "../../view-models/settings";

export function shouldShowSettingsActionDock(section: SettingsSectionViewModel["key"]) {
  return section === "home";
}
