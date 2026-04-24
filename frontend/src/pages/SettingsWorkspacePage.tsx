import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
import { SettingsOverviewCard } from "../components/settings/SettingsOverviewCard";
import {
  getSettingsTaskFlow,
  normalizeSettingsSectionKey,
  OPERATIONS_SECTION_KEYS,
  SettingsOperationsWorkflow,
  type SettingsTaskFlowKey,
} from "../components/settings/SettingsOperationsWorkflow";
import { SettingsSectionSummaryBlock } from "../components/settings/SettingsSectionSummaryBlock";
import { SettingsSideNav } from "../components/settings/SettingsSideNav";
import { SgccLoginQrCodePanel } from "../components/settings/SgccLoginQrCodePanel";
import { SystemConnectionPanel } from "../components/settings/SystemConnectionPanel";
import { TerminalBootstrapTokenPanel } from "../components/settings/TerminalBootstrapTokenPanel";
import { TerminalDeliveryOverviewPanel } from "../components/settings/TerminalDeliveryOverviewPanel";
import { TerminalPairingClaimPanel } from "../components/settings/TerminalPairingClaimPanel";
import { useSettingsBackups } from "../settings/hooks/useSettingsBackups";
import { useSettingsDraft } from "../settings/hooks/useSettingsDraft";
import { useSettingsIntegrations } from "../settings/hooks/useSettingsIntegrations";
import { useSettingsTerminalDeliverySection } from "../settings/hooks/useSettingsTerminalDeliverySection";
import { useSgccLoginQrCode } from "../settings/hooks/useSgccLoginQrCode";
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
  const [activeTaskFlow, setActiveTaskFlow] =
    useState<SettingsTaskFlowKey>(
      normalizedRequestedSection === "backup" ? "backup-restore" : "new-terminal",
    );
  const [showOperationsGuide, setShowOperationsGuide] = useState(false);
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
    compactOverviewRows: deliveryCompactOverviewRows,
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
    showDetails: showDeliveryDetails,
    summaryRows: deliverySummaryRows,
    toggleDetails: toggleDeliveryDetails,
    tokenState: bootstrapTokenState,
  } = useSettingsTerminalDeliverySection({
    canEdit: pin.active,
    currentTerminalId: session.data?.terminalId,
    operationsGuideOpen: showOperationsGuide,
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
    loadRestoreAudits: loadBackupRestoreAudits,
    loading: backupLoading,
    message: backupMessage,
    note: backupNote,
    restore: handleRestoreBackup,
    restoreAudits: backupRestoreAudits,
    restoreBusyId: backupRestoreBusyId,
    setNote: setBackupNote,
  } = useSettingsBackups({
    canEdit: pin.active,
    onBackupRestored: loadSettings,
  });
  const [showPinManager, setShowPinManager] = useState(false);
  const [showHomeContentManager, setShowHomeContentManager] = useState(false);
  const [showHomePublishPanel, setShowHomePublishPanel] = useState(false);
  const [showAdvancedEditor, setShowAdvancedEditor] = useState(false);
  const [showBackupDetails, setShowBackupDetails] = useState(false);

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
      setShowHomeContentManager(false);
      setShowHomePublishPanel(false);
      setShowAdvancedEditor(false);
    }
    if (activeSection !== "delivery") {
      resetDeliveryDetails();
    }
    if (activeSection !== "backup") {
      setShowBackupDetails(false);
    }
  }, [activeSection]);

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

    if (activeSection === "system") {
      void loadMediaCandidates();
      void loadSgccLoginQrCode();
      return;
    }

    if (activeSection === "delivery") {
      void loadDeliveryDetails();
    }
  }, [activeSection, pin.active, session.data?.accessToken, session.status]);

  useEffect(() => {
    if (session.status !== "success" || activeSection !== "system") {
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
    void loadBackups();
    void loadBackupRestoreAudits();
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
  const overviewRows = [
    ...viewModel.overview,
    { label: "HA 连接", value: systemDraft.connectionStatus },
    { label: "能耗状态", value: energyState?.binding_status ?? "-" },
    {
      label: "默认媒体",
      value: mediaState?.display_name ?? mediaState?.binding_status ?? "-",
    },
    { label: "备份", value: `${backupItems.length} 条` },
    { label: "恢复审计", value: `${backupRestoreAudits.length} 条` },
  ];
  overviewRows.splice(1, 0, {
    label: "终端激活",
    value: bootstrapTokenState?.token_configured ? "已配置" : "待配置",
  });
  const activeSectionConfig =
    viewModel.sections.find((section) => section.key === activeSection) ??
    viewModel.sections[0];
  const activeTaskFlowConfig = getSettingsTaskFlow(activeTaskFlow);
  const settingsOverviewRows = [
    ...viewModel.overview,
    { label: "HA 连接", value: systemDraft.connectionStatus },
    { label: "能耗状态", value: energyState?.binding_status ?? "-" },
    {
      label: "默认媒体",
      value: mediaState?.display_name ?? mediaState?.binding_status ?? "-",
    },
    { label: "备份", value: `${backupItems.length} 条` },
    { label: "恢复审计", value: `${backupRestoreAudits.length} 条` },
  ];
  settingsOverviewRows.splice(1, 0, {
    label: "终端激活",
    value: bootstrapTokenState?.token_configured ? "已配置" : "待配置",
  });
  const currentSectionConfig = activeSectionConfig;
  const currentTaskFlowConfig = activeTaskFlowConfig;
  const headerDescription = OPERATIONS_SECTION_KEYS.includes(activeSection)
    ? `${currentSectionConfig.description} 当前任务：${currentTaskFlowConfig.title}。${currentTaskFlowConfig.description}`
    : currentSectionConfig.description;
  const selectedFavoriteCount = settingsDraft.favorites.filter(
    (favorite) => favorite.selected,
  ).length;
  const homeOverviewRows =
    activeSection === "home"
      ? [
          { label: "首页设备", value: `${selectedFavoriteCount} 已启用` },
          { label: "显示规则", value: `${settingsDraft.page.homepageDisplayPolicy.length} 项` },
          { label: "行为规则", value: `${settingsDraft.function.favoriteLimit} 上限` },
          {
            label: "发布面板",
            value: showHomePublishPanel ? "已展开" : "默认折叠",
          },
        ]
      : [];
  const compactOverviewRows =
    activeSection === "system"
      ? settingsOverviewRows.slice(0, 5)
      : activeSection === "delivery"
        ? deliveryCompactOverviewRows
        : activeSection === "backup"
          ? [
              { label: "可用备份", value: `${backupItems.length} 条` },
              { label: "恢复审计", value: `${backupRestoreAudits.length} 条` },
              { label: "详情列表", value: showBackupDetails ? "已展开" : "已收起" },
              { label: "PIN", value: pin.active ? "已验证" : "待验证" },
            ]
          : homeOverviewRows;

  const canSave =
    Boolean(session.data?.terminalId) && pin.active && Boolean(settings.data);

  function handleSelectSection(nextSection: SettingsSectionViewModel["key"]) {
    setActiveSection(nextSection);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("section", nextSection);
    setSearchParams(nextParams, { replace: true });
    if (nextSection === "backup") {
      setActiveTaskFlow("backup-restore");
      return;
    }
    if (nextSection === "delivery" && activeTaskFlow === "backup-restore") {
      setActiveTaskFlow("new-terminal");
    }
  }

  function handleSelectTaskFlow(flowKey: SettingsTaskFlowKey) {
    const nextFlow = getSettingsTaskFlow(flowKey);
    setActiveTaskFlow(flowKey);
    handleSelectSection(nextFlow.primarySection);
  }

  let sectionPanel = (
    <section className="settings-home-shell">
      <section className="panel settings-home-shell__summary">
        <div className="settings-home-shell__summary-copy">
          <span className="card-eyebrow">首页治理</span>
          <h3>把首页内容、规则和发布治理收口到同一个工作台</h3>
          <p className="muted-copy">
            总览页继续负责轻编辑，这里负责首页设备编排、规则治理以及布局与发布能力，避免在多个设置分区之间来回切换。
          </p>
        </div>
        <div className="badge-row settings-home-shell__summary-actions">
          <Link className="button button--ghost" to="/devices">
            前往设备页添加更多
          </Link>
          <Link className="button button--primary" to="/?edit=1">
            进入总览轻编辑
          </Link>
        </div>
      </section>

      <section className="settings-home-shell__group">
        <div className="settings-home-shell__group-header">
          <span className="card-eyebrow">首页内容</span>
          <h3>常用设备与首页入口编排</h3>
          <p className="muted-copy">
            这里负责首页常用设备的启停、排序和基础入口治理，设备的浏览与发现仍然放在设备页。
          </p>
        </div>
        <SettingsSectionSummaryBlock
          rows={[
            { label: "已启用设备", value: selectedFavoriteCount },
            { label: "总条目", value: settingsDraft.favorites.length },
            {
              label: "当前状态",
              value: showHomeContentManager ? "管理中" : "摘要模式",
            },
          ]}
          actions={
            <button
              className="button button--ghost"
              onClick={() => setShowHomeContentManager((current) => !current)}
              type="button"
            >
              {showHomeContentManager ? "收起管理" : "展开管理"}
            </button>
          }
        />
        {showHomeContentManager ? (
          <FavoritesDevicePanel
            favorites={settingsDraft.favorites}
            onAddFavorite={addFavoriteDraft}
            onRemoveFavorite={removeFavoriteDraft}
            onUpdateFavorite={updateFavoriteDraft}
          />
        ) : null}
      </section>

      <section className="settings-home-shell__group">
        <div className="settings-home-shell__group-header">
          <span className="card-eyebrow">首页规则</span>
          <h3>显示策略与行为规则</h3>
          <p className="muted-copy">
            页面策略和功能策略在这里连续呈现，统一处理显示、阈值、入口行为和自动返回等规则。
          </p>
        </div>
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
      </section>

      <section className="settings-home-shell__group">
        <div className="settings-home-shell__group-header">
          <span className="card-eyebrow">布局与发布</span>
          <h3>高级资源、草稿治理和发布入口</h3>
          <p className="muted-copy">
            背景资源、热点高级配置、批量调整和草稿发布都在这里统一处理；若只想直接调整首页舞台，请回到总览页轻编辑。
          </p>
        </div>
        <section className="panel settings-home-advanced__intro">
          <div>
            <span className="card-eyebrow">首页高级设置</span>
            <h3>布局资源、批量编排和草稿治理都在这里</h3>
            <p className="muted-copy">
              总览页只保留所见即所得的轻编辑；背景资源、批量调整、草稿和发布治理统一收口到这一页。
            </p>
          </div>
          <div className="badge-row">
            <button
              className="button button--ghost"
              onClick={() => setShowHomePublishPanel((current) => !current)}
              type="button"
            >
              {showHomePublishPanel ? "收起发布面板" : "展开发布面板"}
            </button>
            <Link className="button button--primary" to="/?edit=1">
              进入总览轻编辑
            </Link>
          </div>
        </section>
        {showHomePublishPanel ? (
          <section className="settings-home-shell__publish-panel">
            <div className="badge-row settings-home-shell__publish-actions">
              <button
                className="button button--ghost"
                onClick={() => setShowAdvancedEditor((current) => !current)}
                type="button"
              >
                {showAdvancedEditor ? "收起高级编辑" : "展开高级编辑"}
              </button>
            </div>
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
            ) : null}
          </section>
        ) : null}
      </section>
    </section>
  );
  if (activeSection === "system") {
    sectionPanel = (
      <>
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
        />
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
      </>
    );
  } else if (activeSection === "delivery") {
    sectionPanel = (
      <section className="settings-section-stack">
        <SettingsSectionSummaryBlock
          rows={deliverySummaryRows}
          actions={
            <button
              className="button button--ghost"
              onClick={toggleDeliveryDetails}
              type="button"
            >
              {showDeliveryDetails ? "收起交付详情" : "展开交付详情"}
            </button>
          }
        />
        {showDeliveryDetails ? (
          <>
            <TerminalDeliveryOverviewPanel
              availableTerminalCount={bootstrapTokenDirectory.length}
              selectedTerminal={selectedBootstrapTerminal}
            />
            <TerminalPairingClaimPanel
              canEdit={pin.active}
              claimBusy={pairingClaimBusy}
              feedback={pairingClaimFeedback}
              onChangePairingCode={setPairingCodeInput}
              onClaim={() => void handleClaimPairingCode()}
              pairingCode={pairingCodeInput}
            />
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
          </>
        ) : null}
      </section>
    );
  } else if (activeSection === "backup") {
    sectionPanel = (
      <section className="settings-section-stack">
        <SettingsSectionSummaryBlock
          rows={[
            { label: "可用备份", value: `${backupItems.length} 条` },
            { label: "恢复审计", value: `${backupRestoreAudits.length} 条` },
            {
              label: "详情列表",
              value: showBackupDetails ? "已展开" : "已收起",
            },
          ]}
          actions={
            <>
              <button
                className="button button--ghost"
                onClick={() => setShowBackupDetails((current) => !current)}
                type="button"
              >
                {showBackupDetails ? "收起备份详情" : "展开备份详情"}
              </button>
              <button
                className="button button--primary"
                disabled={!pin.active || backupCreateBusy || backupLoading}
                onClick={() => void handleCreateBackup()}
                type="button"
              >
                {backupCreateBusy ? "创建中..." : "创建备份"}
              </button>
            </>
          }
        />
        {showBackupDetails ? (
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
        ) : null}
      </section>
    );
  }

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
            description={headerDescription}
            status={settings.status}
            title={currentSectionConfig.label}
            version={viewModel.version}
          />
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
          {!pin.active || showPinManager ? (
            <section className="utility-card settings-inline-pin">
              <div className="settings-inline-pin__header">
                <div>
                  <span className="card-eyebrow">权限提示</span>
                  <h3>{pin.active ? "管理 PIN 已验证" : "部分管理能力需要 PIN"}</h3>
                  <p className="muted-copy">
                    {pin.active
                      ? "当前会话已经具备管理权限，如需查看有效期或重新验证，可以展开 PIN 面板。"
                      : "保存设置、发布草稿和高权限动作前需要先验证管理 PIN。"}
                  </p>
                </div>
                <button
                  className="button button--ghost"
                  onClick={() => setShowPinManager((current) => !current)}
                  type="button"
                >
                  {showPinManager ? "收起 PIN 面板" : "展开 PIN 面板"}
                </button>
              </div>
              {showPinManager || !pin.active ? <PinAccessCard /> : null}
            </section>
          ) : null}
          {OPERATIONS_SECTION_KEYS.includes(activeSection) ? (
            <SettingsSectionSummaryBlock
              rows={[
                { label: "当前任务", value: currentTaskFlowConfig.title },
                { label: "目标结果", value: currentTaskFlowConfig.eyebrow },
                {
                  label: "流程说明",
                  value: showOperationsGuide ? "已展开" : "已收起",
                },
              ]}
              actions={
                <button
                  className="button button--ghost"
                  onClick={() => setShowOperationsGuide((current) => !current)}
                  type="button"
                >
                  {showOperationsGuide ? "收起流程" : "展开流程"}
                </button>
              }
            />
          ) : null}
          {OPERATIONS_SECTION_KEYS.includes(activeSection) && showOperationsGuide ? (
            <SettingsOperationsWorkflow
              activeFlow={activeTaskFlow}
              activeSection={activeSection}
              onSelectFlow={handleSelectTaskFlow}
              onSelectSection={handleSelectSection}
              sections={viewModel.sections}
            />
          ) : null}
          <SettingsOverviewCard rows={compactOverviewRows} />
        </div>
        {sectionPanel}
      </PageFrame>
    </section>
  );
}
