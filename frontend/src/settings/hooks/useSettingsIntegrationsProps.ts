import { useSettingsIntegrations } from "./useSettingsIntegrations";
import { useSgccLoginQrCode } from "./useSgccLoginQrCode";

interface UseSettingsIntegrationsPropsOptions {
  canEdit: boolean;
  onSettingsReload: () => Promise<void>;
}

export function useSettingsIntegrationsProps({
  canEdit,
  onSettingsReload,
}: UseSettingsIntegrationsPropsOptions) {
  const integrations = useSettingsIntegrations({
    canEdit,
    onSettingsReload,
  });
  const sgcc = useSgccLoginQrCode({
    canEdit,
    onEnergyAccountBound: integrations.loadEnergyState,
  });

  return {
    energyState: integrations.energyState,
    loadEnergyState: integrations.loadEnergyState,
    loadMediaCandidates: integrations.loadMediaCandidates,
    loadMediaState: integrations.loadMediaState,
    loadSystemConnection: integrations.loadSystemConnection,
    mediaState: integrations.mediaState,
    sgccLoginQrCode: sgcc.status,
    sgccLoginQrCodeImageUrl: sgcc.imageUrl,
    systemConnectionStatus: integrations.systemDraft.connectionStatus,
    buildIntegrationsProps: (mediaStatus: string, sgccStatus: string) => ({
      energyClearBusy: integrations.energyClearBusy,
      energyDraft: integrations.energyDraft,
      energyMessage: integrations.energyMessage,
      energyRefreshBusy: integrations.energyRefreshBusy,
      energySaveBusy: integrations.energySaveBusy,
      energyState: integrations.energyState,
      handleBindDefaultMedia: () => void integrations.handleBindDefaultMedia(),
      handleClearEnergyBinding: () => void integrations.handleClearEnergyBinding(),
      handlePullSgccEnergyData: () => void sgcc.pullEnergyData(),
      handleRefreshEnergy: () => void integrations.handleRefreshEnergy(),
      handleRegenerateSgccLoginQrCode: () => void sgcc.regenerate(),
      handleSaveEnergyBinding: () => void integrations.handleSaveEnergyBinding(),
      handleSaveSystemConnection: () => void integrations.handleSaveSystemConnection(),
      handleSyncHomeAssistantDevices: () => void integrations.handleSyncHomeAssistantDevices(),
      handleTestSystemConnection: (saved: boolean) =>
        void integrations.handleTestSystemConnection(saved),
      handleUnbindDefaultMedia: () => void integrations.handleUnbindDefaultMedia(),
      loadMediaState: () => void integrations.loadMediaState(),
      loadSgccLoginQrCode: () => void sgcc.loadStatus(),
      mediaBindBusy: integrations.mediaBindBusy,
      mediaCandidateLoading: integrations.mediaCandidateLoading,
      mediaCandidates: integrations.mediaCandidates,
      mediaMessage: integrations.mediaMessage,
      mediaState: integrations.mediaState,
      mediaStatus,
      mediaUnbindBusy: integrations.mediaUnbindBusy,
      pinActive: canEdit,
      selectedMediaDeviceId: integrations.selectedMediaDeviceId,
      setSelectedMediaDeviceId: integrations.setSelectedMediaDeviceId,
      sgccLoginQrCode: sgcc.status,
      sgccLoginQrCodeImageUrl: sgcc.imageUrl,
      sgccLoginQrCodeLoading: sgcc.loading,
      sgccLoginQrCodeMessage: sgcc.message,
      sgccLoginQrCodePullBusy: sgcc.pullBusy,
      sgccLoginQrCodeRegenerateBusy: sgcc.regenerateBusy,
      sgccStatus,
      systemDraft: integrations.systemDraft,
      systemMessage: integrations.systemMessage,
      systemSaveBusy: integrations.systemSaveBusy,
      systemSyncBusy: integrations.systemSyncBusy,
      systemTestBusy: integrations.systemTestBusy,
      updateEnergyAccountId: integrations.updateEnergyAccountId,
      updateEnergyEntity: integrations.updateEnergyEntity,
      updateSystemDraft: integrations.updateSystemDraft,
    }),
    loadSgccLoginQrCode: sgcc.loadStatus,
  };
}
