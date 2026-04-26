import { fetchSettings } from "../../api/settingsApi";
import { normalizeApiError } from "../../api/httpClient";
import { shouldShowSettingsActionDock } from "../../components/settings/settingsPageUiRules";
import { appStore, useAppStore } from "../../store/useAppStore";
import { mapSettingsViewModel } from "../../view-models/settings";
import { useSettingsBackupProps } from "./useSettingsBackupProps";
import { useSettingsHomeDraftProps } from "./useSettingsHomeDraftProps";
import { useSettingsIntegrationsProps } from "./useSettingsIntegrationsProps";
import { useSettingsOverviewProps } from "./useSettingsOverviewProps";
import { useSettingsTerminalProps } from "./useSettingsTerminalProps";
import { useSettingsWorkspaceLifecycle } from "./useSettingsWorkspaceLifecycle";
import { useSettingsWorkspaceNavigation } from "./useSettingsWorkspaceNavigation";

export function useSettingsWorkspaceController() {
  const session = useAppStore((state) => state.session);
  const pin = useAppStore((state) => state.pin);
  const settings = useAppStore((state) => state.settings);
  const latestWsEvent = useAppStore((state) => state.wsEvents[0] ?? null);

  const backup = useSettingsBackupProps({
    canEdit: pin.active,
    onBackupRestored: loadSettings,
  });
  const terminal = useSettingsTerminalProps({
    canEdit: pin.active,
    currentTerminalId: session.data?.terminalId,
  });
  const navigation = useSettingsWorkspaceNavigation({
    resetBackupDetails: backup.resetBackupDetails,
    resetDeliveryDetails: terminal.resetDeliveryDetails,
  });
  const homeDraft = useSettingsHomeDraftProps({
    onSaved: loadSettings,
    settingsData: settings.data,
    setShowAdvancedEditor: navigation.setShowAdvancedEditor,
    showAdvancedEditor: navigation.showAdvancedEditor,
    terminalId: session.data?.terminalId,
  });
  const integrations = useSettingsIntegrationsProps({
    canEdit: pin.active,
    onSettingsReload: loadSettings,
  });
  const viewModel = mapSettingsViewModel(settings.data);
  const activeSectionConfig =
    viewModel.sections.find((section) => section.key === navigation.activeSection) ??
    viewModel.sections[0];
  const overview = useSettingsOverviewProps({
    backupItems: backup.backupItems,
    energyState: integrations.energyState,
    mediaState: integrations.mediaState,
    onSelectSection: navigation.handleSelectSection,
    pinActive: pin.active,
    selectedFavoriteCount: homeDraft.selectedFavoriteCount,
    sgccLoginQrCode: integrations.sgccLoginQrCode,
    systemConnectionStatus: integrations.systemConnectionStatus,
    terminalTokenConfigured: Boolean(terminal.tokenConfigured),
  });

  async function loadSettings() {
    appStore.setSettingsLoading();
    try {
      const bootstrapDirectoryPromise = terminal.loadBootstrapTokenDirectoryForSettingsLoad();
      const [settingsData] = await Promise.all([
        fetchSettings(),
        integrations.loadSystemConnection(),
        bootstrapDirectoryPromise,
      ]);
      appStore.setSettingsData(settingsData);
      homeDraft.applySettingsDraftFromData(settingsData);
    } catch (error) {
      appStore.setSettingsError(normalizeApiError(error).message);
    }
  }

  useSettingsWorkspaceLifecycle({
    activeSection: navigation.activeSection,
    latestWsEvent,
    loadBackupDetails: backup.loadBackupDetails,
    loadBackupRestoreAudits: backup.loadBackupRestoreAudits,
    loadBackups: backup.loadBackups,
    loadDeliveryDetails: terminal.loadDeliveryDetails,
    loadEnergyState: integrations.loadEnergyState,
    loadMediaCandidates: integrations.loadMediaCandidates,
    loadMediaState: integrations.loadMediaState,
    loadSettings,
    loadSgccLoginQrCode: integrations.loadSgccLoginQrCode,
    loadSystemConnection: integrations.loadSystemConnection,
    pinActive: pin.active,
    session,
    sgccLoginQrCodeImageUrl: integrations.sgccLoginQrCodeImageUrl,
    sgccLoginQrCodeUpdatedAt: integrations.sgccLoginQrCode?.updated_at,
  });

  return {
    activeSection: navigation.activeSection,
    activeSectionConfig,
    canSave: Boolean(session.data?.terminalId) && pin.active && Boolean(settings.data),
    handleSave: homeDraft.handleSave,
    handleSelectSection: navigation.handleSelectSection,
    isSaving: homeDraft.isSaving,
    pinActive: pin.active,
    pinRequired: viewModel.pinRequired,
    saveMessage: homeDraft.saveMessage,
    sectionPanelProps: {
      activeSection: navigation.activeSection,
      backup: backup.backupProps,
      home: homeDraft.homeProps,
      integrations: integrations.buildIntegrationsProps(
        overview.mediaStatus,
        overview.sgccStatus,
      ),
      overview: overview.overviewProps,
      terminal: terminal.buildTerminalProps(navigation.togglePinManager),
    },
    settings,
    shouldShowActionDock: shouldShowSettingsActionDock(navigation.activeSection),
    showPinManager: navigation.showPinManager,
    togglePinManager: navigation.togglePinManager,
    viewModel,
  };
}
