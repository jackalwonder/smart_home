import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { EnergyDto, SgccLoginQrCodeStatusDto } from "../api/types";
import { fetchSettings } from "../api/settingsApi";
import { normalizeApiError } from "../api/httpClient";
import { PinAccessCard } from "../components/auth/PinAccessCard";
import { PageFrame } from "../components/layout/PageFrame";
import { BackupManagementPanel } from "../components/settings/BackupManagementPanel";
import { DefaultMediaPanel } from "../components/settings/DefaultMediaPanel";
import { EnergyBindingPanel } from "../components/settings/EnergyBindingPanel";
import { FavoritesDevicePanel } from "../components/settings/FavoritesDevicePanel";
import { FunctionSettingsPanel } from "../components/settings/FunctionSettingsPanel";
import { PageSettingsPanel } from "../components/settings/PageSettingsPanel";
import { SettingsActionDock } from "../components/settings/SettingsActionDock";
import { SettingsHeaderBar } from "../components/settings/SettingsHeaderBar";
import { normalizeSettingsSectionKey } from "../components/settings/SettingsOperationsWorkflow";
import { SettingsPinGate } from "../components/settings/SettingsPinGate";
import { SettingsSectionSummaryBlock } from "../components/settings/SettingsSectionSummaryBlock";
import { SettingsSideNav } from "../components/settings/SettingsSideNav";
import { SettingsTaskModule } from "../components/settings/SettingsTaskModule";
import { SgccLoginQrCodePanel } from "../components/settings/SgccLoginQrCodePanel";
import { SystemConnectionPanel } from "../components/settings/SystemConnectionPanel";
import { TerminalBootstrapTokenPanel } from "../components/settings/TerminalBootstrapTokenPanel";
import { TerminalDeliveryOverviewPanel } from "../components/settings/TerminalDeliveryOverviewPanel";
import { TerminalPairingClaimPanel } from "../components/settings/TerminalPairingClaimPanel";
import { shouldShowSettingsActionDock } from "../components/settings/settingsPageUiRules";
import { useSettingsBackupSection } from "../settings/hooks/useSettingsBackupSection";
import { useSettingsDraft } from "../settings/hooks/useSettingsDraft";
import { useSettingsIntegrations } from "../settings/hooks/useSettingsIntegrations";
import { useSettingsTerminalDeliverySection } from "../settings/hooks/useSettingsTerminalDeliverySection";
import { useSgccLoginQrCode } from "../settings/hooks/useSgccLoginQrCode";
import {
  formatSettingsStatus,
  getSettingsStatusTone,
  SettingsStatusTone,
} from "../settings/statusFormat";
import { appStore, useAppStore } from "../store/useAppStore";
import {
  SettingsSectionViewModel,
  mapSettingsViewModel,
} from "../view-models/settings";

const LazyEditorWorkbenchWorkspace = lazy(() =>
  import("./EditorWorkbenchWorkspace").then((module) => ({
    default: module.EditorWorkbenchWorkspace,
  })),
);

interface RuntimeCard {
  actionLabel: string;
  description: string;
  key: string;
  label: string;
  section: SettingsSectionViewModel["key"];
  status: string;
  targetId: string;
  tone: SettingsStatusTone;
}

function formatCount(value: number, unit: string) {
  return `${value} ${unit}`;
}

function formatShortTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  const month = parsed.getMonth() + 1;
  const day = parsed.getDate();
  const hour = String(parsed.getHours()).padStart(2, "0");
  const minute = String(parsed.getMinutes()).padStart(2, "0");
  return `${month}月${day}日 ${hour}:${minute}`;
}

function getSgccOverviewCopy(status: SgccLoginQrCodeStatusDto | null) {
  const phase = status?.phase ?? status?.status ?? "UNKNOWN";
  const accountCount = status?.account_count ?? 0;
  const latestAccount = formatShortTimestamp(status?.latest_account_timestamp);
  if (phase === "DATA_READY") {
    return {
      actionLabel: "查看国网账号",
      description: `已发现 ${accountCount} 个账号${
        latestAccount ? `，最新数据 ${latestAccount}` : ""
      }。二维码状态只作为扫码文件明细。`,
    };
  }
  if (phase === "FETCHING_DATA") {
    return {
      actionLabel: "查看拉取进度",
      description: "国网扫码已通过，正在拉取账号和电量数据。",
    };
  }
  if (phase === "QR_READY") {
    return {
      actionLabel: "去扫码",
      description: "二维码可扫码，请用国家电网 App 完成登录确认。",
    };
  }
  if (phase === "WAITING_FOR_SCAN") {
    return {
      actionLabel: "查看二维码",
      description: "登录流程正在等待扫码确认，二维码状态在详情里查看。",
    };
  }
  if (phase === "QR_EXPIRED" || phase === "EXPIRED") {
    return {
      actionLabel: "重新登录",
      description: "当前二维码文件已过期；如果没有可用账号缓存，需要重新生成二维码。",
    };
  }
  if (phase === "LOGIN_RUNNING") {
    return {
      actionLabel: "查看登录进度",
      description: "国网登录任务正在运行，二维码准备后会显示扫码入口。",
    };
  }
  return {
    actionLabel: "检查国网",
    description: "国网状态暂未获取，进入接入配置查看 sidecar 状态。",
  };
}

function getEnergyOverviewCopy(
  energy: EnergyDto | null,
  sgccStatus: SgccLoginQrCodeStatusDto | null,
) {
  const bindingStatus = energy?.binding_status ?? "UNKNOWN";
  const phase = sgccStatus?.phase ?? sgccStatus?.status ?? "UNKNOWN";
  const sourceUpdatedAt = formatShortTimestamp(
    energy?.source_updated_at ?? energy?.system_updated_at ?? energy?.updated_at,
  );
  if (bindingStatus !== "BOUND") {
    return {
      actionLabel: phase === "DATA_READY" ? "绑定能耗账号" : "处理能耗",
      description:
        phase === "DATA_READY"
          ? "国网数据已就绪，下一步是把账号缓存绑定到首页能耗卡。"
          : "先确认国网账号缓存，再绑定能耗账号和 HA 实体。",
      status: formatSettingsStatus(bindingStatus, "connection"),
      tone: getSettingsStatusTone(bindingStatus, "connection"),
    };
  }
  if (energy?.refresh_status === "FAILED") {
    return {
      actionLabel: "查看刷新错误",
      description: energy.last_error_code
        ? `能耗已绑定，但最近刷新失败：${energy.last_error_code}。`
        : "能耗已绑定，但最近刷新失败，需要检查上游同步。",
      status: "刷新失败",
      tone: "danger" as SettingsStatusTone,
    };
  }
  if (energy?.refresh_status === "SUCCESS") {
    return {
      actionLabel: "刷新能耗",
      description: sourceUpdatedAt
        ? `能耗已绑定，最近数据更新时间 ${sourceUpdatedAt}。`
        : "能耗已绑定，最近刷新成功。",
      status: "能耗已同步",
      tone: "success" as SettingsStatusTone,
    };
  }
  return {
    actionLabel: "刷新能耗",
    description: "能耗已绑定，等待首次同步或手动刷新。",
    status: "等待同步",
    tone: "warning" as SettingsStatusTone,
  };
}

export function SettingsWorkspacePage() {
  const session = useAppStore((state) => state.session);
  const pin = useAppStore((state) => state.pin);
  const settings = useAppStore((state) => state.settings);
  const latestWsEvent = useAppStore((state) => state.wsEvents[0] ?? null);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = searchParams.get("section");
  const normalizedRequestedSection = normalizeSettingsSectionKey(requestedSection);
  const [activeSection, setActiveSection] =
    useState<SettingsSectionViewModel["key"]>(
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
      const nextSettingsData = settingsData as unknown as Record<
        string,
        unknown
      >;
      appStore.setSettingsData(nextSettingsData);
      applySettingsDraftFromData(nextSettingsData);
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
  const canSave =
    Boolean(session.data?.terminalId) && pin.active && Boolean(settings.data);
  const terminalStatus = bootstrapTokenState?.token_configured
    ? "已准备"
    : "待生成";
  const sgccStatus = sgccLoginQrCode?.phase ?? sgccLoginQrCode?.status ?? "UNKNOWN";
  const mediaStatus = mediaState?.display_name
    ? mediaState.display_name
    : formatSettingsStatus(mediaState?.binding_status ?? "MEDIA_UNSET", "media");
  const sgccOverviewCopy = getSgccOverviewCopy(sgccLoginQrCode);
  const energyOverviewCopy = getEnergyOverviewCopy(energyState, sgccLoginQrCode);
  const backupReadyCount = backupItems.filter((item) => item.status === "READY").length;
  const runtimeCards = useMemo<RuntimeCard[]>(
    () => [
      {
        actionLabel: "检查接入",
        description: "HA 连接、测试配置和设备重载。",
        key: "ha",
        label: "Home Assistant",
        section: "integrations",
        status: formatSettingsStatus(systemDraft.connectionStatus, "connection"),
        targetId: "settings-module-ha",
        tone: getSettingsStatusTone(systemDraft.connectionStatus, "connection"),
      },
      {
        actionLabel: energyOverviewCopy.actionLabel,
        description: energyOverviewCopy.description,
        key: "energy",
        label: "能耗服务",
        section: "integrations",
        status: energyOverviewCopy.status,
        targetId: "settings-module-energy",
        tone: energyOverviewCopy.tone,
      },
      {
        actionLabel: "配置媒体",
        description: "默认播放设备和候选设备列表。",
        key: "media",
        label: "默认媒体",
        section: "integrations",
        status: mediaStatus,
        targetId: "settings-module-media",
        tone: getSettingsStatusTone(mediaState?.binding_status ?? "MEDIA_UNSET", "media"),
      },
      {
        actionLabel: sgccOverviewCopy.actionLabel,
        description: sgccOverviewCopy.description,
        key: "sgcc",
        label: "国网登录",
        section: "integrations",
        status: formatSettingsStatus(sgccStatus, "sgcc"),
        targetId: "settings-module-sgcc",
        tone: getSettingsStatusTone(sgccStatus, "sgcc"),
      },
      {
        actionLabel: "终端与权限",
        description: "PIN、绑定码认领和激活凭据。",
        key: "terminal",
        label: "终端与权限",
        section: "terminal",
        status: terminalStatus,
        targetId: "settings-module-terminal-pairing",
        tone: bootstrapTokenState?.token_configured ? "success" : "warning",
      },
      {
        actionLabel: "查看备份",
        description: "恢复点、恢复审计和版本回退。",
        key: "backup",
        label: "备份恢复",
        section: "backup",
        status: `${backupReadyCount}/${backupItems.length} 可用`,
        targetId: "settings-module-backup",
        tone: backupItems.length ? "success" : "neutral",
      },
    ],
    [
      backupItems.length,
      backupReadyCount,
      bootstrapTokenState?.token_configured,
      energyState?.binding_status,
      energyState?.last_error_code,
      energyState?.refresh_status,
      energyState?.source_updated_at,
      energyState?.system_updated_at,
      energyState?.updated_at,
      energyOverviewCopy.actionLabel,
      energyOverviewCopy.description,
      energyOverviewCopy.status,
      energyOverviewCopy.tone,
      mediaState?.binding_status,
      mediaStatus,
      sgccLoginQrCode,
      sgccOverviewCopy.actionLabel,
      sgccOverviewCopy.description,
      sgccStatus,
      systemDraft.connectionStatus,
      terminalStatus,
    ],
  );

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

  const overviewPanel = (
    <section className="settings-runtime-overview" aria-label="运行总览">
      <section className="settings-runtime-hero">
        <div>
          <span className="card-eyebrow">运行总览</span>
          <h3>先处理异常，再进入配置</h3>
          <p className="muted-copy">
            这里只展示真实状态和下一步动作。说明文案、低频字段和高级配置都收进对应任务区。
          </p>
        </div>
        <dl className="settings-runtime-hero__stats">
          <div>
            <dt>PIN</dt>
            <dd>{pin.active ? "已验证" : "待验证"}</dd>
          </div>
          <div>
            <dt>首页常用</dt>
            <dd>{formatCount(selectedFavoriteCount, "个")}</dd>
          </div>
          <div>
            <dt>备份</dt>
            <dd>{formatCount(backupItems.length, "条")}</dd>
          </div>
        </dl>
      </section>

      <div className="settings-runtime-grid">
        {runtimeCards.map((card) => (
          <article className="settings-runtime-card" key={card.key}>
            <div className="settings-runtime-card__header">
              <div>
                <span className="card-eyebrow">{card.label}</span>
                <strong>{card.status}</strong>
              </div>
              <span className={`settings-status-dot is-${card.tone}`} aria-hidden />
            </div>
            <p>{card.description}</p>
            <button
              className="button button--ghost"
              onClick={() => handleSelectSection(card.section, card.targetId)}
              type="button"
            >
              {card.actionLabel}
            </button>
          </article>
        ))}
      </div>
    </section>
  );

  const integrationsPanel = (
    <section className="settings-section-stack">
      <SettingsTaskModule
        action={
          <button
            className="button button--ghost"
            disabled={!pin.active || systemTestBusy}
            onClick={() => void handleTestSystemConnection(true)}
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
          canEdit={pin.active}
          draft={systemDraft}
          message={systemMessage}
          onChange={updateSystemDraft}
          onSave={() => void handleSaveSystemConnection()}
          onSyncDevices={() => void handleSyncHomeAssistantDevices()}
          onTestCandidate={() => void handleTestSystemConnection(false)}
          onTestSaved={() => void handleTestSystemConnection(true)}
          saveBusy={systemSaveBusy}
          syncBusy={systemSyncBusy}
          testBusy={systemTestBusy}
        />
      </SettingsTaskModule>

      <SettingsTaskModule
        action={
          <button
            className="button button--ghost"
            disabled={!pin.active || energyRefreshBusy}
            onClick={() => void handleRefreshEnergy()}
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
          canEdit={pin.active}
          clearBusy={energyClearBusy}
          draft={energyDraft}
          energy={energyState}
          message={energyMessage}
          onChangeAccountId={updateEnergyAccountId}
          onChangeEntity={updateEnergyEntity}
          onClear={() => void handleClearEnergyBinding()}
          onRefresh={() => void handleRefreshEnergy()}
          onSave={() => void handleSaveEnergyBinding()}
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
            onClick={() => void loadSgccLoginQrCode()}
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
          canBind={pin.active}
          canRegenerate={pin.active}
          imageUrl={sgccLoginQrCodeImageUrl}
          loading={sgccLoginQrCodeLoading}
          message={sgccLoginQrCodeMessage}
          onBindEnergyAccount={() => void handleBindSgccEnergyAccount()}
          onRegenerate={() => void handleRegenerateSgccLoginQrCode()}
          onRefreshStatus={() => void loadSgccLoginQrCode()}
          regenerateBusy={sgccLoginQrCodeRegenerateBusy}
          status={sgccLoginQrCode}
        />
      </SettingsTaskModule>

      <SettingsTaskModule
        action={
          <button
            className="button button--ghost"
            onClick={() => void loadMediaState()}
            type="button"
          >
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
          canEdit={pin.active}
          loadingCandidates={mediaCandidateLoading}
          media={mediaState}
          message={mediaMessage}
          onBind={() => void handleBindDefaultMedia()}
          onRefresh={() => void loadMediaState()}
          onSelectDeviceId={setSelectedMediaDeviceId}
          onUnbind={() => void handleUnbindDefaultMedia()}
          selectedDeviceId={selectedMediaDeviceId}
          unbindBusy={mediaUnbindBusy}
        />
      </SettingsTaskModule>
    </section>
  );

  const homePanel = (
    <section className="settings-home-shell">
      <section className="panel settings-home-shell__summary">
        <div className="settings-home-shell__summary-copy">
          <span className="card-eyebrow">草稿保存</span>
          <h3>首页治理字段修改后统一点“保存首页设置”</h3>
          <p className="muted-copy">
            这一页的常用设备、显示策略和功能策略都是设置草稿；接入、终端和备份动作则会直接调用各自 API。
          </p>
        </div>
        <div className="badge-row settings-home-shell__summary-actions">
          <span className="state-chip">{saveMessage ? "刚刚保存" : "草稿模式"}</span>
          <Link className="button button--primary" to="/?edit=1">
            进入总览轻编辑
          </Link>
        </div>
      </section>

      <SettingsTaskModule
        defaultOpen
        description="管理首页常用设备的启停、排序和基础入口；设备发现仍在设备页处理。"
        eyebrow="首页治理"
        status={`${selectedFavoriteCount}/${settingsDraft.favorites.length} 启用`}
        statusTone="neutral"
        title="常用设备"
      >
        <FavoritesDevicePanel
          favorites={settingsDraft.favorites}
          onAddFavorite={addFavoriteDraft}
          onRemoveFavorite={removeFavoriteDraft}
          onUpdateFavorite={updateFavoriteDraft}
        />
      </SettingsTaskModule>

      <SettingsTaskModule
        defaultOpen
        description="集中维护首页展示、图标、布局、阈值和自动返回等规则。"
        eyebrow="首页治理"
        status={`${settingsDraft.page.homepageDisplayPolicy.length} 项显示策略`}
        statusTone="neutral"
        title="显示策略与行为规则"
      >
        <PageSettingsPanel
          draft={settingsDraft.page}
          onAddPolicyEntry={addPolicyDraft}
          onChangePolicyEntry={updatePolicyDraft}
          onChangeRoomLabelMode={(value) =>
            updatePageDraft("roomLabelMode", value)
          }
          onRemovePolicyEntry={removePolicyDraft}
          onSetPolicyValue={upsertPolicyDraft}
        />
        <FunctionSettingsPanel
          draft={settingsDraft.function}
          onChange={updateFunctionDraft}
        />
      </SettingsTaskModule>

      <SettingsTaskModule
        action={
          <button
            className="button button--ghost"
            onClick={() => setShowAdvancedEditor((current) => !current)}
            type="button"
          >
            {showAdvancedEditor ? "收起编辑器" : "展开编辑器"}
          </button>
        }
        description="高频调整去总览轻编辑；资源、热点高级配置和发布治理留在这里按需展开。"
        eyebrow="首页治理"
        status={showAdvancedEditor ? "编辑器已展开" : "默认收起"}
        statusTone="neutral"
        title="布局与发布"
      >
        {showAdvancedEditor ? (
          <Suspense
            fallback={
              <div className="utility-card editor-loading" role="status">
                编辑器加载中...
              </div>
            }
          >
            <LazyEditorWorkbenchWorkspace embedded />
          </Suspense>
        ) : (
          <div className="settings-empty-detail">
            <p className="muted-copy">
              高级编辑器会加载完整首页工作台，默认收起以避免干扰常规设置。
            </p>
            <Link className="button button--ghost" to="/?edit=1">
              去总览轻编辑
            </Link>
          </div>
        )}
      </SettingsTaskModule>
    </section>
  );

  const terminalPanel = (
    <section className="settings-section-stack">
      <SettingsSectionSummaryBlock
        rows={[
          { label: "PIN", value: pin.active ? "已验证" : "待验证" },
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
            {pin.active ? "查看 PIN" : "验证 PIN"}
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
        status={pin.active ? "可操作" : "需要 PIN"}
        statusTone={pin.active ? "success" : "warning"}
        title="绑定码认领"
      >
        <TerminalPairingClaimPanel
          canEdit={pin.active}
          claimBusy={pairingClaimBusy}
          feedback={pairingClaimFeedback}
          onChangePairingCode={setPairingCodeInput}
          onClaim={() => void handleClaimPairingCode()}
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
          canEdit={pin.active}
          createBusy={bootstrapTokenCreateBusy}
          loading={bootstrapTokenLoading}
          message={bootstrapTokenFeedback}
          onCopy={() => void handleCopyBootstrapToken()}
          onCopyActivationCode={() => void handleCopyBootstrapActivationCode()}
          onCopyActivationLink={() => void handleCopyBootstrapActivationLink()}
          onCreateOrReset={() => void handleCreateOrResetBootstrapToken()}
          onRefresh={() => void loadBootstrapTokenDirectory()}
          onRefreshAudits={() => void loadBootstrapTokenAudits()}
          onSelectTerminalId={setSelectedBootstrapTerminalId}
          revealedToken={bootstrapTokenReveal}
          selectedTerminalId={selectedBootstrapTerminalId}
          status={selectedBootstrapTerminal}
        />
      </SettingsTaskModule>
    </section>
  );

  const backupPanel = (
    <section className="settings-section-stack">
      <SettingsSectionSummaryBlock
        rows={[
          { label: "可用备份", value: `${backupReadyCount} 条` },
          { label: "备份总数", value: `${backupItems.length} 条` },
          { label: "恢复审计", value: `${backupRestoreAudits.length} 条` },
        ]}
        actions={
          <button
            className="button button--primary"
            disabled={!pin.active || backupCreateBusy || backupLoading}
            onClick={() => void handleCreateBackup()}
            type="button"
          >
            {backupCreateBusy ? "创建中..." : "立即创建备份"}
          </button>
        }
      />
      <div id="settings-module-backup">
        <BackupManagementPanel
          auditLoading={backupAuditLoading}
          backups={backupItems}
          canEdit={pin.active}
          createBusy={backupCreateBusy}
          loading={backupLoading}
          message={backupMessage}
          note={backupNote}
          onChangeNote={setBackupNote}
          onCreateBackup={() => void handleCreateBackup()}
          onRefreshAudits={() => void loadBackupRestoreAudits()}
          onRefresh={() => void loadBackups()}
          onRestoreBackup={(backup) => void handleRestoreBackup(backup)}
          restoreAudits={backupRestoreAudits}
          restoreBusyId={backupRestoreBusyId}
        />
      </div>
    </section>
  );

  const sectionPanel =
    activeSection === "overview"
      ? overviewPanel
      : activeSection === "integrations"
        ? integrationsPanel
        : activeSection === "home"
          ? homePanel
          : activeSection === "terminal"
            ? terminalPanel
            : backupPanel;

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
