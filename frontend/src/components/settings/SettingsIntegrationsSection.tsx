import type { ComponentProps } from "react";
import { formatSettingsStatus, getSettingsStatusTone } from "../../settings/statusFormat";
import { DefaultMediaPanel } from "./DefaultMediaPanel";
import { EnergyBindingPanel } from "./EnergyBindingPanel";
import { SettingsTaskModule } from "./SettingsTaskModule";
import { SgccEnergySyncPanel } from "./SgccEnergySyncPanel";
import { SystemConnectionPanel } from "./SystemConnectionPanel";

interface SettingsIntegrationsSectionProps {
  energyClearBusy: boolean;
  energyDraft: ComponentProps<typeof EnergyBindingPanel>["draft"];
  energyMessage: string | null;
  energyRefreshBusy: boolean;
  energySaveBusy: boolean;
  energyState: ComponentProps<typeof EnergyBindingPanel>["energy"];
  handleBindDefaultMedia: () => void;
  handleClearEnergyBinding: () => void;
  handlePullSgccEnergyData: () => void;
  handleRefreshEnergy: () => void;
  handleRegenerateSgccLoginQrCode: () => void;
  handleSaveEnergyBinding: () => void;
  handleSaveSystemConnection: () => void;
  handleSyncHomeAssistantDevices: () => void;
  handleTestSystemConnection: (saved: boolean) => void;
  handleUnbindDefaultMedia: () => void;
  loadMediaState: () => void;
  loadSgccLoginQrCode: () => void;
  mediaBindBusy: boolean;
  mediaCandidateLoading: boolean;
  mediaCandidates: ComponentProps<typeof DefaultMediaPanel>["availableDevices"];
  mediaMessage: string | null;
  mediaState: ComponentProps<typeof DefaultMediaPanel>["media"];
  mediaStatus: string;
  mediaUnbindBusy: boolean;
  pinActive: boolean;
  selectedMediaDeviceId: string;
  setSelectedMediaDeviceId: (value: string) => void;
  sgccLoginQrCode: ComponentProps<typeof SgccEnergySyncPanel>["status"];
  sgccLoginQrCodeImageUrl: string | null;
  sgccLoginQrCodeLoading: boolean;
  sgccLoginQrCodeMessage: string | null;
  sgccLoginQrCodePullBusy: boolean;
  sgccLoginQrCodeRegenerateBusy: boolean;
  sgccStatus: string;
  systemDraft: ComponentProps<typeof SystemConnectionPanel>["draft"];
  systemMessage: string | null;
  systemSaveBusy: boolean;
  systemSyncBusy: boolean;
  systemTestBusy: boolean;
  updateEnergyAccountId: (value: string) => void;
  updateEnergyEntity: ComponentProps<typeof EnergyBindingPanel>["onChangeEntity"];
  updateSystemDraft: ComponentProps<typeof SystemConnectionPanel>["onChange"];
}

export function SettingsIntegrationsSection({
  energyClearBusy,
  energyDraft,
  energyMessage,
  energyRefreshBusy,
  energySaveBusy,
  energyState,
  handleBindDefaultMedia,
  handleClearEnergyBinding,
  handlePullSgccEnergyData,
  handleRefreshEnergy,
  handleRegenerateSgccLoginQrCode,
  handleSaveEnergyBinding,
  handleSaveSystemConnection,
  handleSyncHomeAssistantDevices,
  handleTestSystemConnection,
  handleUnbindDefaultMedia,
  loadMediaState,
  loadSgccLoginQrCode,
  mediaBindBusy,
  mediaCandidateLoading,
  mediaCandidates,
  mediaMessage,
  mediaState,
  mediaStatus,
  mediaUnbindBusy,
  pinActive,
  selectedMediaDeviceId,
  setSelectedMediaDeviceId,
  sgccLoginQrCode,
  sgccLoginQrCodeImageUrl,
  sgccLoginQrCodeLoading,
  sgccLoginQrCodeMessage,
  sgccLoginQrCodePullBusy,
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
}: SettingsIntegrationsSectionProps) {
  return (
    <section className="settings-section-stack">
      <SettingsTaskModule
        action={
          <button
            className="button button--ghost"
            disabled={!pinActive || systemTestBusy}
            onClick={() => handleTestSystemConnection(true)}
            type="button"
          >
            {systemTestBusy ? "测试中..." : "测试已保存连接"}
          </button>
        }
        defaultOpen
        description="保存、测试 Home Assistant 接入，并在需要时重载设备目录。"
        eyebrow="接入配置"
        id="settings-module-ha"
        status={formatSettingsStatus(systemDraft.connectionStatus, "connection")}
        statusTone={getSettingsStatusTone(systemDraft.connectionStatus, "connection")}
        title="Home Assistant"
      >
        <SystemConnectionPanel
          canEdit={pinActive}
          draft={systemDraft}
          message={systemMessage}
          onChange={updateSystemDraft}
          onSave={handleSaveSystemConnection}
          onSyncDevices={handleSyncHomeAssistantDevices}
          onTestCandidate={() => handleTestSystemConnection(false)}
          onTestSaved={() => handleTestSystemConnection(true)}
          saveBusy={systemSaveBusy}
          syncBusy={systemSyncBusy}
          testBusy={systemTestBusy}
        />
      </SettingsTaskModule>

      <SettingsTaskModule
        action={
          <button
            className="button button--ghost"
            disabled={sgccLoginQrCodeLoading}
            onClick={loadSgccLoginQrCode}
            type="button"
          >
            {sgccLoginQrCodeLoading ? "刷新中..." : "刷新状态"}
          </button>
        }
        defaultOpen
        description="扫码登录后手动拉取国家电网能耗，自动同步到 HA 实体并生成本地缓存；刷新能耗只读取 HA/缓存。"
        eyebrow="接入配置"
        id="settings-module-energy"
        status={formatSettingsStatus(sgccStatus, "sgcc")}
        statusTone={getSettingsStatusTone(sgccStatus, "sgcc")}
        title="国家电网用电同步"
      >
        <SgccEnergySyncPanel
          canEdit={pinActive}
          clearBusy={energyClearBusy}
          draft={energyDraft}
          energy={energyState}
          energyMessage={energyMessage}
          imageUrl={sgccLoginQrCodeImageUrl}
          loading={sgccLoginQrCodeLoading}
          onChangeAccountId={updateEnergyAccountId}
          onChangeEntity={updateEnergyEntity}
          onClear={handleClearEnergyBinding}
          onPullEnergyData={handlePullSgccEnergyData}
          onRefreshEnergy={handleRefreshEnergy}
          onRefreshStatus={loadSgccLoginQrCode}
          onRegenerate={handleRegenerateSgccLoginQrCode}
          onSave={handleSaveEnergyBinding}
          pullBusy={sgccLoginQrCodePullBusy}
          refreshBusy={energyRefreshBusy}
          regenerateBusy={sgccLoginQrCodeRegenerateBusy}
          saveBusy={energySaveBusy}
          sgccMessage={sgccLoginQrCodeMessage}
          status={sgccLoginQrCode}
        />
      </SettingsTaskModule>

      <SettingsTaskModule
        action={
          <button className="button button--ghost" onClick={loadMediaState} type="button">
            刷新媒体状态
          </button>
        }
        description="选择默认媒体设备。候选设备仍来自设备目录，后续可继续收紧后端筛选。"
        eyebrow="接入配置"
        id="settings-module-media"
        status={mediaStatus}
        statusTone={getSettingsStatusTone(
          mediaState?.binding_status ?? "MEDIA_UNSET",
          "media",
        )}
        title="默认媒体"
      >
        <DefaultMediaPanel
          availableDevices={mediaCandidates}
          bindBusy={mediaBindBusy}
          canEdit={pinActive}
          loadingCandidates={mediaCandidateLoading}
          media={mediaState}
          message={mediaMessage}
          onBind={handleBindDefaultMedia}
          onRefresh={loadMediaState}
          onSelectDeviceId={setSelectedMediaDeviceId}
          onUnbind={handleUnbindDefaultMedia}
          selectedDeviceId={selectedMediaDeviceId}
          unbindBusy={mediaUnbindBusy}
        />
      </SettingsTaskModule>
    </section>
  );
}
