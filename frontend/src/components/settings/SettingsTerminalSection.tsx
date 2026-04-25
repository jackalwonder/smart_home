import type { ComponentProps } from "react";
import { SettingsSectionSummaryBlock } from "./SettingsSectionSummaryBlock";
import { SettingsTaskModule } from "./SettingsTaskModule";
import { TerminalBootstrapTokenPanel } from "./TerminalBootstrapTokenPanel";
import { TerminalDeliveryOverviewPanel } from "./TerminalDeliveryOverviewPanel";
import { TerminalPairingClaimPanel } from "./TerminalPairingClaimPanel";

interface SettingsTerminalSectionProps {
  bootstrapActivationCode: string | null;
  bootstrapActivationLink: string | null;
  bootstrapTokenAuditLoading: boolean;
  bootstrapTokenAudits: ComponentProps<typeof TerminalBootstrapTokenPanel>["audits"];
  bootstrapTokenCreateBusy: boolean;
  bootstrapTokenDirectory: ComponentProps<typeof TerminalBootstrapTokenPanel>["availableTerminals"];
  bootstrapTokenFeedback: ComponentProps<typeof TerminalBootstrapTokenPanel>["message"];
  bootstrapTokenLoading: boolean;
  bootstrapTokenReveal: ComponentProps<typeof TerminalBootstrapTokenPanel>["revealedToken"];
  bootstrapTokenState: ComponentProps<typeof TerminalBootstrapTokenPanel>["status"];
  handleClaimPairingCode: () => void;
  handleCopyBootstrapActivationCode: () => void;
  handleCopyBootstrapActivationLink: () => void;
  handleCopyBootstrapToken: () => void;
  handleCreateOrResetBootstrapToken: () => void;
  loadBootstrapTokenAudits: () => void;
  loadBootstrapTokenDirectory: () => void;
  pairingClaimBusy: boolean;
  pairingClaimFeedback: ComponentProps<typeof TerminalPairingClaimPanel>["feedback"];
  pairingCodeInput: string;
  pinActive: boolean;
  selectedBootstrapTerminal: ComponentProps<typeof TerminalDeliveryOverviewPanel>["selectedTerminal"];
  selectedBootstrapTerminalId: string;
  setPairingCodeInput: (value: string) => void;
  setSelectedBootstrapTerminalId: (value: string) => void;
  setShowPinManager: (updater: (current: boolean) => boolean) => void;
  terminalStatus: string;
}

export function SettingsTerminalSection({
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
  handleClaimPairingCode,
  handleCopyBootstrapActivationCode,
  handleCopyBootstrapActivationLink,
  handleCopyBootstrapToken,
  handleCreateOrResetBootstrapToken,
  loadBootstrapTokenAudits,
  loadBootstrapTokenDirectory,
  pairingClaimBusy,
  pairingClaimFeedback,
  pairingCodeInput,
  pinActive,
  selectedBootstrapTerminal,
  selectedBootstrapTerminalId,
  setPairingCodeInput,
  setSelectedBootstrapTerminalId,
  setShowPinManager,
  terminalStatus,
}: SettingsTerminalSectionProps) {
  return (
    <section className="settings-section-stack">
      <SettingsSectionSummaryBlock
        rows={[
          { label: "PIN", value: pinActive ? "已验证" : "待验证" },
          { label: "终端目录", value: `${bootstrapTokenDirectory.length} 台` },
          {
            label: "目标终端",
            value:
              selectedBootstrapTerminal?.terminal_name ??
              selectedBootstrapTerminal?.terminal_code ??
              "-",
          },
        ]}
        actions={
          <button
            className="button button--ghost"
            onClick={() => setShowPinManager((current) => !current)}
            type="button"
          >
            {pinActive ? "查看 PIN" : "验证 PIN"}
          </button>
        }
      />
      <TerminalDeliveryOverviewPanel
        availableTerminalCount={bootstrapTokenDirectory.length}
        selectedTerminal={selectedBootstrapTerminal}
      />
      <SettingsTaskModule
        defaultOpen
        description="新终端显示绑定码后，在这里认领并让终端自动完成激活。"
        eyebrow="终端与权限"
        id="settings-module-terminal-pairing"
        status={pinActive ? "可操作" : "需要 PIN"}
        statusTone={pinActive ? "success" : "warning"}
        title="绑定码认领"
      >
        <TerminalPairingClaimPanel
          canEdit={pinActive}
          claimBusy={pairingClaimBusy}
          feedback={pairingClaimFeedback}
          onChangePairingCode={setPairingCodeInput}
          onClaim={handleClaimPairingCode}
          pairingCode={pairingCodeInput}
        />
      </SettingsTaskModule>
      <SettingsTaskModule
        description="换机、重装或现场恢复时，为目标终端生成一次性激活凭据。"
        eyebrow="终端与权限"
        id="settings-module-terminal-token"
        status={terminalStatus}
        statusTone={bootstrapTokenState?.token_configured ? "success" : "warning"}
        title="激活凭据交付"
      >
        <TerminalBootstrapTokenPanel
          activationCode={bootstrapActivationCode}
          activationLink={bootstrapActivationLink}
          audits={bootstrapTokenAudits}
          auditLoading={bootstrapTokenAuditLoading}
          availableTerminals={bootstrapTokenDirectory}
          canEdit={pinActive}
          createBusy={bootstrapTokenCreateBusy}
          loading={bootstrapTokenLoading}
          message={bootstrapTokenFeedback}
          onCopy={handleCopyBootstrapToken}
          onCopyActivationCode={handleCopyBootstrapActivationCode}
          onCopyActivationLink={handleCopyBootstrapActivationLink}
          onCreateOrReset={handleCreateOrResetBootstrapToken}
          onRefresh={loadBootstrapTokenDirectory}
          onRefreshAudits={loadBootstrapTokenAudits}
          onSelectTerminalId={setSelectedBootstrapTerminalId}
          revealedToken={bootstrapTokenReveal}
          selectedTerminalId={selectedBootstrapTerminalId}
          status={selectedBootstrapTerminal}
        />
      </SettingsTaskModule>
    </section>
  );
}
