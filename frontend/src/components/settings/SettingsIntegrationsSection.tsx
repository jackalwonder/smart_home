import type { ComponentProps } from "react";
import { formatSettingsStatus, getSettingsStatusTone } from "../../settings/statusFormat";
import { DefaultMediaPanel } from "./DefaultMediaPanel";
import { EnergyBindingPanel } from "./EnergyBindingPanel";
import { SettingsTaskModule } from "./SettingsTaskModule";
import { SgccLoginQrCodePanel } from "./SgccLoginQrCodePanel";
import { SystemConnectionPanel } from "./SystemConnectionPanel";

interface SettingsIntegrationsSectionProps {
  energyClearBusy: boolean;
  energyDraft: ComponentProps<typeof EnergyBindingPanel>["draft"];
  energyMessage: string | null;
  energyRefreshBusy: boolean;
  energySaveBusy: boolean;
  energyState: ComponentProps<typeof EnergyBindingPanel>["energy"];
  handleBindDefaultMedia: () => void;
  handleBindSgccEnergyAccount: () => void;
  handleClearEnergyBinding: () => void;
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
  sgccLoginQrCode: ComponentProps<typeof SgccLoginQrCodePanel>["status"];
  sgccLoginQrCodeBindBusy: boolean;
  sgccLoginQrCodeImageUrl: string | null;
  sgccLoginQrCodeLoading: boolean;
  sgccLoginQrCodeMessage: string | null;
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
  handleBindSgccEnergyAccount,
  handleClearEnergyBinding,
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
            disabled={!pinActive || energyRefreshBusy}
            onClick={handleRefreshEnergy}
            type="button"
          >
            {energyRefreshBusy ? "刷新中..." : "刷新能耗"}
          </button>
        }
        defaultOpen
        description="绑定 SGCC 缓存读取结果，检查刷新状态，并把页面展示依赖的实体对齐。"
        eyebrow="接入配置"
        id="settings-module-energy"
        status={formatSettingsStatus(energyState?.binding_status, "connection")}
        statusTone={getSettingsStatusTone(energyState?.binding_status, "connection")}
        title="能耗与 SGCC 缓存"
      >
        <EnergyBindingPanel
          canEdit={pinActive}
          clearBusy={energyClearBusy}
          draft={energyDraft}
          energy={energyState}
          message={energyMessage}
          onChangeAccountId={updateEnergyAccountId}
          onChangeEntity={updateEnergyEntity}
          onClear={handleClearEnergyBinding}
          onRefresh={handleRefreshEnergy}
          onSave={handleSaveEnergyBinding}
          refreshBusy={energyRefreshBusy}
          saveBusy={energySaveBusy}
          sgccAccountCount={sgccLoginQrCode?.account_count ?? 0}
          sgccLatestAccountTimestamp={sgccLoginQrCode?.latest_account_timestamp ?? null}
          sgccPhase={sgccStatus}
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
            {sgccLoginQrCodeLoading ? "刷新中..." : "刷新二维码状态"}
          </button>
        }
        description="查看国网整体阶段、账号缓存和二维码文件状态。二维码过期不再等同于登录过期。"
        eyebrow="接入配置"
        id="settings-module-sgcc"
        status={formatSettingsStatus(sgccStatus, "sgcc")}
        statusTone={getSettingsStatusTone(sgccStatus, "sgcc")}
        title="国网登录二维码"
      >
        <SgccLoginQrCodePanel
          bindBusy={sgccLoginQrCodeBindBusy}
          canBind={pinActive}
          canRegenerate={pinActive}
          imageUrl={sgccLoginQrCodeImageUrl}
          loading={sgccLoginQrCodeLoading}
          message={sgccLoginQrCodeMessage}
          onBindEnergyAccount={handleBindSgccEnergyAccount}
          onRegenerate={handleRegenerateSgccLoginQrCode}
          onRefreshStatus={loadSgccLoginQrCode}
          regenerateBusy={sgccLoginQrCodeRegenerateBusy}
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
        statusTone={getSettingsStatusTone(mediaState?.binding_status ?? "MEDIA_UNSET", "media")}
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
