import { PinAccessCard } from "../components/auth/PinAccessCard";
import { PageFrame } from "../components/layout/PageFrame";
import { SettingsActionDock } from "../components/settings/SettingsActionDock";
import { SettingsHeaderBar } from "../components/settings/SettingsHeaderBar";
import { SettingsPinGate } from "../components/settings/SettingsPinGate";
import { SettingsSideNav } from "../components/settings/SettingsSideNav";
import { useSettingsWorkspaceController } from "../settings/hooks/useSettingsWorkspaceController";
import { SettingsSectionPanel } from "./SettingsWorkspaceSections";

export function SettingsWorkspacePage() {
  const controller = useSettingsWorkspaceController();

  return (
    <section className="page page--settings">
      {controller.settings.error ? (
        <p className="inline-error">{controller.settings.error}</p>
      ) : null}
      <PageFrame
        aside={
          <div className="settings-page__aside">
            <SettingsSideNav
              activeSection={controller.activeSection}
              onSelectSection={controller.handleSelectSection}
              sections={controller.viewModel.sections}
            />
          </div>
        }
        asidePosition="left"
        className="page-frame--settings"
      >
        <div className="settings-showcase-shell">
          <SettingsHeaderBar
            description={controller.activeSectionConfig.description}
            status={controller.settings.status}
            title={controller.activeSectionConfig.label}
            version={controller.viewModel.version}
          />
          {controller.shouldShowActionDock ? (
            <SettingsActionDock
              canSave={controller.canSave}
              onManagePin={controller.togglePinManager}
              onSave={() => void controller.handleSave()}
              pinActive={controller.pinActive}
              pinRequired={controller.pinRequired}
              saveMessage={controller.saveMessage}
              saving={controller.isSaving}
              variant="compact"
              version={controller.viewModel.version}
            />
          ) : null}
          <SettingsPinGate
            onToggle={controller.togglePinManager}
            pinAccessPanel={<PinAccessCard />}
            pinActive={controller.pinActive}
            showPinManager={controller.showPinManager}
          />
        </div>
        <SettingsSectionPanel {...controller.sectionPanelProps} />
      </PageFrame>
    </section>
  );
}
