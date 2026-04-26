import { useSettingsTerminalDeliverySection } from "./useSettingsTerminalDeliverySection";

interface UseSettingsTerminalPropsOptions {
  canEdit: boolean;
  currentTerminalId?: string | null;
}

export function useSettingsTerminalProps({
  canEdit,
  currentTerminalId,
}: UseSettingsTerminalPropsOptions) {
  const terminal = useSettingsTerminalDeliverySection({
    canEdit,
    currentTerminalId,
    operationsGuideOpen: false,
  });
  const terminalStatus = terminal.tokenState?.token_configured ? "已准备" : "待生成";

  return {
    loadBootstrapTokenDirectoryForSettingsLoad: terminal.loadInitialDirectory,
    loadBootstrapTokenDirectory: terminal.loadDirectory,
    loadBootstrapTokenAudits: terminal.loadAudits,
    loadDeliveryDetails: terminal.loadDetails,
    resetDeliveryDetails: terminal.resetDetails,
    tokenConfigured: Boolean(terminal.tokenState?.token_configured),
    buildTerminalProps: (
      setShowPinManager: (updater: (current: boolean) => boolean) => void,
    ) => ({
      bootstrapActivationCode: terminal.activationCode,
      bootstrapActivationLink: terminal.activationLink,
      bootstrapTokenAuditLoading: terminal.auditLoading,
      bootstrapTokenAudits: terminal.audits,
      bootstrapTokenCreateBusy: terminal.createBusy,
      bootstrapTokenDirectory: terminal.directory,
      bootstrapTokenFeedback: terminal.feedback,
      bootstrapTokenLoading: terminal.loading,
      bootstrapTokenReveal: terminal.reveal,
      bootstrapTokenState: terminal.tokenState,
      handleClaimPairingCode: () => void terminal.claimPairingCode(),
      handleCopyBootstrapActivationCode: () => void terminal.copyActivationCode(),
      handleCopyBootstrapActivationLink: () => void terminal.copyActivationLink(),
      handleCopyBootstrapToken: () => void terminal.copyToken(),
      handleCreateOrResetBootstrapToken: () => void terminal.createOrReset(),
      loadBootstrapTokenAudits: () => void terminal.loadAudits(),
      loadBootstrapTokenDirectory: () => void terminal.loadDirectory(),
      pairingClaimBusy: terminal.pairingClaimBusy,
      pairingClaimFeedback: terminal.pairingClaimFeedback,
      pairingCodeInput: terminal.pairingCode,
      pinActive: canEdit,
      selectedBootstrapTerminal: terminal.selectedTerminal,
      selectedBootstrapTerminalId: terminal.selectedTerminalId,
      setPairingCodeInput: terminal.setPairingCode,
      setSelectedBootstrapTerminalId: terminal.setSelectedTerminalId,
      setShowPinManager,
      terminalStatus,
    }),
  };
}
