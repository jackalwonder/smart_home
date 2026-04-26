import type { ComponentProps } from "react";
import { SettingsBackupSection } from "../components/settings/SettingsBackupSection";
import { SettingsHomeSection } from "../components/settings/SettingsHomeSection";
import { SettingsIntegrationsSection } from "../components/settings/SettingsIntegrationsSection";
import { SettingsRuntimeOverview } from "../components/settings/SettingsRuntimeOverview";
import { SettingsTerminalSection } from "../components/settings/SettingsTerminalSection";
import type { SettingsSectionViewModel } from "../view-models/settings";

type OverviewProps = ComponentProps<typeof SettingsRuntimeOverview>;
type IntegrationsProps = ComponentProps<typeof SettingsIntegrationsSection>;
type HomeProps = ComponentProps<typeof SettingsHomeSection>;
type TerminalProps = ComponentProps<typeof SettingsTerminalSection>;
type BackupProps = ComponentProps<typeof SettingsBackupSection>;

export interface SettingsSectionPanelProps {
  activeSection: SettingsSectionViewModel["key"];
  backup: BackupProps;
  home: HomeProps;
  integrations: IntegrationsProps;
  overview: OverviewProps;
  terminal: TerminalProps;
}

function SettingsOverviewContainer(props: OverviewProps) {
  return <SettingsRuntimeOverview {...props} />;
}

function SettingsIntegrationsContainer(props: IntegrationsProps) {
  return <SettingsIntegrationsSection {...props} />;
}

function SettingsHomeContainer(props: HomeProps) {
  return <SettingsHomeSection {...props} />;
}

function SettingsTerminalContainer(props: TerminalProps) {
  return <SettingsTerminalSection {...props} />;
}

function SettingsBackupContainer(props: BackupProps) {
  return <SettingsBackupSection {...props} />;
}

export function SettingsSectionPanel({
  activeSection,
  backup,
  home,
  integrations,
  overview,
  terminal,
}: SettingsSectionPanelProps) {
  if (activeSection === "overview") {
    return <SettingsOverviewContainer {...overview} />;
  }

  if (activeSection === "integrations") {
    return <SettingsIntegrationsContainer {...integrations} />;
  }

  if (activeSection === "home") {
    return <SettingsHomeContainer {...home} />;
  }

  if (activeSection === "terminal") {
    return <SettingsTerminalContainer {...terminal} />;
  }

  return <SettingsBackupContainer {...backup} />;
}
