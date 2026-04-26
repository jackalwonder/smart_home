import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchSettings } from "../api/settingsApi";
import { normalizeApiError } from "../api/httpClient";
import { PinAccessCard } from "../components/auth/PinAccessCard";
import { PageFrame } from "../components/layout/PageFrame";
import { SettingsActionDock } from "../components/settings/SettingsActionDock";
import { SettingsHeaderBar } from "../components/settings/SettingsHeaderBar";
import { normalizeSettingsSectionKey } from "../components/settings/SettingsOperationsWorkflow";
import { SettingsPinGate } from "../components/settings/SettingsPinGate";
import { SettingsSideNav } from "../components/settings/SettingsSideNav";
import { shouldShowSettingsActionDock } from "../components/settings/settingsPageUiRules";
import { useSettingsBackupSection } from "../settings/hooks/useSettingsBackupSection";
import { useSettingsDraft } from "../settings/hooks/useSettingsDraft";
import { useSettingsIntegrations } from "../settings/hooks/useSettingsIntegrations";
import { useSettingsTerminalDeliverySection } from "../settings/hooks/useSettingsTerminalDeliverySection";
import { useSgccLoginQrCode } from "../settings/hooks/useSgccLoginQrCode";
import { buildSettingsRuntimeCards } from "../settings/runtimeOverview";
import { appStore, useAppStore } from "../store/useAppStore";
import { SettingsSectionViewModel, mapSettingsViewModel } from "../view-models/settings";
import { SettingsSectionPanel } from "./SettingsWorkspaceSections";

export function SettingsWorkspacePage() {
  const session = useAppStore((state) => state.session);
  const pin = useAppStore((state) => state.pin);
  const settings = useAppStore((state) => state.settings);
  const latestWsEvent = useAppStore((state) => state.wsEvents[0] ?? null);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = searchParams.get("section");
  const normalizedRequestedSection = normalizeSettingsSectionKey(requestedSection);
  const [activeSection, setActiveSection] = useState<SettingsSectionViewModel["key"]>(
    normalizedRequestedSection,
  );
  const [showPinManager, setShowPinManager] = useState(false);
  const [showAdvancedEditor, setShowAdvancedEditor] = useState(false);
  const [pendingScrollTargetId, setPendingScrollTargetId] = useState<string | null>(null);

  const {
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
  } = useSettingsDraft({
    onSaved: loadSettings,
    settingsData: settings.data,
    terminalId: session.data?.terminalId,
  });
  const {
    energyClearBusy,
    energyDraft,
    energyMessage,
    energyRefreshBusy,
    energySaveBusy,
    energyState,
    handleBindDefaultMedia,
    handleClearEnergyBinding,
    handleRefreshEnergy,
    handleSaveEnergyBinding,
    handleSaveSystemConnection,
    handleSyncHomeAssistantDevices,
    handleTestSystemConnection,
    handleUnbindDefaultMedia,
    loadEnergyState,
    loadMediaCandidates,
    loadMediaState,
    loadSystemConnection,
    mediaBindBusy,
    mediaCandidateLoading,
    mediaCandidates,
    mediaMessage,
    mediaState,
    mediaUnbindBusy,
    selectedMediaDeviceId,
    setSelectedMediaDeviceId,
    systemDraft,
    systemMessage,
    systemSaveBusy,
    systemSyncBusy,
    systemTestBusy,
    updateEnergyAccountId,
    updateEnergyEntity,
    updateSystemDraft,
  } = useSettingsIntegrations({
    canEdit: pin.active,
    onSettingsReload: loadSettings,
  });
  const {
    activationCode: bootstrapActivationCode,
    activationLink: bootstrapActivationLink,
    auditLoading: bootstrapTokenAuditLoading,
    audits: bootstrapTokenAudits,
    copyActivationCode: handleCopyBootstrapActivationCode,
    copyActivationLink: handleCopyBootstrapActivationLink,
    copyToken: handleCopyBootstrapToken,
    createBusy: bootstrapTokenCreateBusy,
    createOrReset: handleCreateOrResetBootstrapToken,
    directory: bootstrapTokenDirectory,
    feedback: bootstrapTokenFeedback,
    loadDetails: loadDeliveryDetails,
    loadAudits: loadBootstrapTokenAudits,
    loadDirectory: loadBootstrapTokenDirectory,
    loadInitialDirectory: loadBootstrapTokenDirectoryForSettingsLoad,
    loading: bootstrapTokenLoading,
    pairingClaimBusy,
    pairingClaimFeedback,
    pairingCode: pairingCodeInput,
    claimPairingCode: handleClaimPairingCode,
    reveal: bootstrapTokenReveal,
    resetDetails: resetDeliveryDetails,
    selectedTerminal: selectedBootstrapTerminal,
    selectedTerminalId: selectedBootstrapTerminalId,
    setPairingCode: setPairingCodeInput,
    setSelectedTerminalId: setSelectedBootstrapTerminalId,
    tokenState: bootstrapTokenState,
  } = useSettingsTerminalDeliverySection({
    canEdit: pin.active,
    currentTerminalId: session.data?.terminalId,
    operationsGuideOpen: false,
  });
  const {
    bindBusy: sgccLoginQrCodeBindBusy,
    bindEnergyAccount: handleBindSgccEnergyAccount,
    imageUrl: sgccLoginQrCodeImageUrl,
    loadStatus: loadSgccLoginQrCode,
    loading: sgccLoginQrCodeLoading,
    message: sgccLoginQrCodeMessage,
    regenerate: handleRegenerateSgccLoginQrCode,
    regenerateBusy: sgccLoginQrCodeRegenerateBusy,
    status: sgccLoginQrCode,
  } = useSgccLoginQrCode({
    canEdit: pin.active,
    onEnergyAccountBound: loadEnergyState,
  });
  const {
    auditLoading: backupAuditLoading,
    create: handleCreateBackup,
    createBusy: backupCreateBusy,
    items: backupItems,
    loadBackups,
    loadDetails: loadBackupDetails,
    loadRestoreAudits: loadBackupRestoreAudits,
    loading: backupLoading,
    message: backupMessage,
    note: backupNote,
    resetDetails: resetBackupDetails,
    restore: handleRestoreBackup,
    restoreAudits: backupRestoreAudits,
    restoreBusyId: backupRestoreBusyId,
    setNote: setBackupNote,
  } = useSettingsBackupSection({
    canEdit: pin.active,
    onBackupRestored: loadSettings,
  });

  useEffect(() => {
    if (requestedSection && requestedSection !== normalizedRequestedSection) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("section", normalizedRequestedSection);
      setSearchParams(nextParams, { replace: true });
    }

    if (normalizedRequestedSection !== activeSection) {
      setActiveSection(normalizedRequestedSection);
    }
  }, [
    activeSection,
    normalizedRequestedSection,
    requestedSection,
    searchParams,
    setSearchParams,
  ]);

  useEffect(() => {
    setShowPinManager(false);
    if (activeSection !== "home") {
      setShowAdvancedEditor(false);
    }
    if (activeSection !== "terminal") {
      resetDeliveryDetails();
    }
    if (activeSection !== "backup") {
      resetBackupDetails();
    }
  }, [activeSection, resetBackupDetails, resetDeliveryDetails]);

  useEffect(() => {
    if (!pendingScrollTargetId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      document
        .getElementById(pendingScrollTargetId)
        ?.scrollIntoView({ block: "start", behavior: "smooth" });
      setPendingScrollTargetId(null);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeSection, pendingScrollTargetId]);

  async function loadSettings() {
    appStore.setSettingsLoading();
    try {
      const bootstrapDirectoryPromise = loadBootstrapTokenDirectoryForSettingsLoad();
      const [settingsData] = await Promise.all([
        fetchSettings(),
        loadSystemConnection(),
        bootstrapDirectoryPromise,
      ]);
      appStore.setSettingsData(settingsData);
      applySettingsDraftFromData(settingsData);
    } catch (error) {
      appStore.setSettingsError(normalizeApiError(error).message);
    }
  }

  useEffect(() => {
    if (session.status !== "success") {
      return;
    }
    void loadSettings();
    void loadEnergyState();
    void loadMediaState();
  }, [session.data?.accessToken, session.status]);

  useEffect(() => {
    if (session.status !== "success") {
      return;
    }

    if (activeSection === "integrations") {
      void loadMediaCandidates();
      void loadSgccLoginQrCode();
      return;
    }

    if (activeSection === "overview") {
      void loadSgccLoginQrCode({ quiet: true });
      return;
    }

    if (activeSection === "terminal") {
      void loadDeliveryDetails();
    }
  }, [activeSection, pin.active, session.data?.accessToken, session.status]);

  useEffect(() => {
    if (
      session.status !== "success" ||
      (activeSection !== "integrations" && activeSection !== "overview")
    ) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadSgccLoginQrCode({ quiet: true });
    }, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    activeSection,
    session.data?.accessToken,
    session.status,
    sgccLoginQrCode?.updated_at,
    sgccLoginQrCodeImageUrl,
  ]);

  useEffect(() => {
    if (session.status !== "success") {
      return;
    }
    void loadBackupDetails();
  }, [pin.active, session.data?.accessToken, session.status]);

  useEffect(() => {
    if (!latestWsEvent) {
      return;
    }

    switch (latestWsEvent.event_type) {
      case "backup_restore_completed":
        void Promise.all([
          loadSettings(),
          loadSystemConnection(),
          loadEnergyState(),
          loadMediaState(),
          loadBackups(),
          loadBackupRestoreAudits(),
        ]);
        break;
      case "energy_refresh_completed":
      case "energy_refresh_failed":
        void Promise.all([loadEnergyState(), loadSettings()]);
        break;
      case "ha_sync_degraded":
      case "ha_sync_recovered":
        void loadSystemConnection();
        break;
      case "media_state_changed":
        void Promise.all([loadMediaState(), loadSettings()]);
        break;
      case "settings_updated":
        void loadSettings();
        break;
      default:
        break;
    }
  }, [latestWsEvent]);

  const viewModel = mapSettingsViewModel(settings.data);
  const activeSectionConfig =
    viewModel.sections.find((section) => section.key === activeSection) ??
    viewModel.sections[0];
  const selectedFavoriteCount = settingsDraft.favorites.filter(
    (favorite) => favorite.selected,
  ).length;
  const canSave = Boolean(session.data?.terminalId) && pin.active && Boolean(settings.data);
  const terminalStatus = bootstrapTokenState?.token_configured ? "已准备" : "待生成";
  const sgccStatus = sgccLoginQrCode?.phase ?? sgccLoginQrCode?.status ?? "UNKNOWN";
  const runtimeCards = useMemo(
    () =>
      buildSettingsRuntimeCards({
        backupItems,
        energyState,
        mediaState,
        sgccLoginQrCode,
        systemConnectionStatus: systemDraft.connectionStatus,
        terminalTokenConfigured: Boolean(bootstrapTokenState?.token_configured),
      }),
    [
      backupItems,
      bootstrapTokenState?.token_configured,
      energyState,
      mediaState,
      sgccLoginQrCode,
      systemDraft.connectionStatus,
    ],
  );
  const mediaStatus =
    mediaState?.display_name ??
    runtimeCards.find((card) => card.key === "media")?.status ??
    "未设置";
  const backupReadyCount = backupItems.filter((item) => item.status === "READY").length;

  function handleSelectSection(
    nextSection: SettingsSectionViewModel["key"],
    targetId?: string,
  ) {
    setActiveSection(nextSection);
    setPendingScrollTargetId(targetId ?? null);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("section", nextSection);
    setSearchParams(nextParams, { replace: true });
  }

  const sectionPanel = (
    <SettingsSectionPanel
      activeSection={activeSection}
      backup={{
        backupAuditLoading,
        backupCreateBusy,
        backupItems,
        backupLoading,
        backupMessage,
        backupNote,
        backupReadyCount,
        backupRestoreAudits,
        backupRestoreBusyId,
        handleCreateBackup: () => void handleCreateBackup(),
        handleRestoreBackup: (backup) => void handleRestoreBackup(backup),
        loadBackupRestoreAudits: () => void loadBackupRestoreAudits(),
        loadBackups: () => void loadBackups(),
        pinActive: pin.active,
        setBackupNote,
      }}
      home={{
        addFavoriteDraft,
        addPolicyDraft,
        removeFavoriteDraft,
        removePolicyDraft,
        saveMessage,
        selectedFavoriteCount,
        setShowAdvancedEditor,
        settingsDraft,
        showAdvancedEditor,
        updateFavoriteDraft,
        updateFunctionDraft,
        updatePageDraft,
        updatePolicyDraft,
        upsertPolicyDraft,
      }}
      integrations={{
        energyClearBusy,
        energyDraft,
        energyMessage,
        energyRefreshBusy,
        energySaveBusy,
        energyState,
        handleBindDefaultMedia: () => void handleBindDefaultMedia(),
        handleBindSgccEnergyAccount: () => void handleBindSgccEnergyAccount(),
        handleClearEnergyBinding: () => void handleClearEnergyBinding(),
        handleRefreshEnergy: () => void handleRefreshEnergy(),
        handleRegenerateSgccLoginQrCode: () => void handleRegenerateSgccLoginQrCode(),
        handleSaveEnergyBinding: () => void handleSaveEnergyBinding(),
        handleSaveSystemConnection: () => void handleSaveSystemConnection(),
        handleSyncHomeAssistantDevices: () => void handleSyncHomeAssistantDevices(),
        handleTestSystemConnection: (saved) => void handleTestSystemConnection(saved),
        handleUnbindDefaultMedia: () => void handleUnbindDefaultMedia(),
        loadMediaState: () => void loadMediaState(),
        loadSgccLoginQrCode: () => void loadSgccLoginQrCode(),
        mediaBindBusy,
        mediaCandidateLoading,
        mediaCandidates,
        mediaMessage,
        mediaState,
        mediaStatus,
        mediaUnbindBusy,
        pinActive: pin.active,
        selectedMediaDeviceId,
        setSelectedMediaDeviceId,
        sgccLoginQrCode,
        sgccLoginQrCodeBindBusy,
        sgccLoginQrCodeImageUrl,
        sgccLoginQrCodeLoading,
        sgccLoginQrCodeMessage,
        sgccLoginQrCodeRegenerateBusy,
        sgccStatus,
        systemDraft,
        systemMessage,
        systemSaveBusy,
        systemSyncBusy,
        systemTestBusy,
        updateEnergyAccountId,
        updateEnergyEntity,
        updateSystemDraft,
      }}
      overview={{
        backupCount: backupItems.length,
        onSelectSection: handleSelectSection,
        pinActive: pin.active,
        runtimeCards,
        selectedFavoriteCount,
      }}
      terminal={{
        bootstrapActivationCode,
        bootstrapActivationLink,
        bootstrapTokenAuditLoading,
        bootstrapTokenAudits,
        bootstrapTokenCreateBusy,
        bootstrapTokenDirectory,
        bootstrapTokenFeedback,
        bootstrapTokenLoading,
        bootstrapTokenReveal,
        bootstrapTokenState,
        handleClaimPairingCode: () => void handleClaimPairingCode(),
        handleCopyBootstrapActivationCode: () => void handleCopyBootstrapActivationCode(),
        handleCopyBootstrapActivationLink: () => void handleCopyBootstrapActivationLink(),
        handleCopyBootstrapToken: () => void handleCopyBootstrapToken(),
        handleCreateOrResetBootstrapToken: () => void handleCreateOrResetBootstrapToken(),
        loadBootstrapTokenAudits: () => void loadBootstrapTokenAudits(),
        loadBootstrapTokenDirectory: () => void loadBootstrapTokenDirectory(),
        pairingClaimBusy,
        pairingClaimFeedback,
        pairingCodeInput,
        pinActive: pin.active,
        selectedBootstrapTerminal,
        selectedBootstrapTerminalId,
        setPairingCodeInput,
        setSelectedBootstrapTerminalId,
        setShowPinManager,
        terminalStatus,
      }}
    />
  );

  return (
    <section className="page page--settings">
      {settings.error ? <p className="inline-error">{settings.error}</p> : null}
      <PageFrame
        aside={
          <div className="settings-page__aside">
            <SettingsSideNav
              activeSection={activeSection}
              onSelectSection={handleSelectSection}
              sections={viewModel.sections}
            />
          </div>
        }
        asidePosition="left"
        className="page-frame--settings"
      >
        <div className="settings-showcase-shell">
          <SettingsHeaderBar
            description={activeSectionConfig.description}
            status={settings.status}
            title={activeSectionConfig.label}
            version={viewModel.version}
          />
          {shouldShowSettingsActionDock(activeSection) ? (
            <SettingsActionDock
              canSave={canSave}
              onManagePin={() => setShowPinManager((current) => !current)}
              onSave={() => void handleSave()}
              pinActive={pin.active}
              pinRequired={viewModel.pinRequired}
              saveMessage={saveMessage}
              saving={isSaving}
              variant="compact"
              version={viewModel.version}
            />
          ) : null}
          <SettingsPinGate
            onToggle={() => setShowPinManager((current) => !current)}
            pinAccessPanel={<PinAccessCard />}
            pinActive={pin.active}
            showPinManager={showPinManager}
          />
        </div>
        {sectionPanel}
      </PageFrame>
    </section>
  );
}
