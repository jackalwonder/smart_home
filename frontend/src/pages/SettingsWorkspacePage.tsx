import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchDevices } from "../api/devicesApi";
import {
  clearEnergyBinding,
  fetchEnergy,
  refreshEnergy,
  saveEnergyBinding,
} from "../api/energyApi";
import {
  bindDefaultMedia,
  fetchDefaultMedia,
  unbindDefaultMedia,
} from "../api/mediaApi";
import {
  fetchSettings,
  saveSettings,
} from "../api/settingsApi";
import {
  fetchSystemConnections,
  reloadHomeAssistantDevices,
  saveHomeAssistantConnection,
  testHomeAssistantConnection,
} from "../api/systemConnectionsApi";
import {
  DefaultMediaDto,
  DeviceListItemDto,
  EnergyDto,
  EnergyRefreshDto,
  SystemConnectionsEnvelopeDto,
} from "../api/types";
import { normalizeApiError } from "../api/httpClient";
import { PinAccessCard } from "../components/auth/PinAccessCard";
import { PageFrame } from "../components/layout/PageFrame";
import { BackupManagementPanel } from "../components/settings/BackupManagementPanel";
import { DefaultMediaPanel } from "../components/settings/DefaultMediaPanel";
import {
  EnergyBindingDraft,
  EnergyBindingPanel,
  EnergyEntityMapKey,
} from "../components/settings/EnergyBindingPanel";
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
import {
  PolicyEntryDraft,
  PolicyEntryDraftType,
} from "../components/settings/StructuredPolicyEditor";
import { SystemConnectionPanel } from "../components/settings/SystemConnectionPanel";
import { TerminalBootstrapTokenPanel } from "../components/settings/TerminalBootstrapTokenPanel";
import { TerminalDeliveryOverviewPanel } from "../components/settings/TerminalDeliveryOverviewPanel";
import { TerminalPairingClaimPanel } from "../components/settings/TerminalPairingClaimPanel";
import { useSettingsBackups } from "../settings/hooks/useSettingsBackups";
import { useSgccLoginQrCode } from "../settings/hooks/useSgccLoginQrCode";
import { useTerminalDelivery } from "../settings/hooks/useTerminalDelivery";
import { appStore, useAppStore } from "../store/useAppStore";
import {
  SettingsSectionViewModel,
  mapSettingsViewModel,
} from "../view-models/settings";
import {
  asArray,
  asBoolean,
  asNumber,
  asRecord,
  asString,
} from "../view-models/utils";

const LazyEditorWorkbenchWorkspace = lazy(() =>
  import("./EditorWorkbenchWorkspace").then((module) => ({
    default: module.EditorWorkbenchWorkspace,
  })),
);

interface SettingsDraftState {
  page: {
    roomLabelMode: string;
    homepageDisplayPolicy: PolicyEntryDraft[];
    iconPolicy: PolicyEntryDraft[];
    layoutPreference: PolicyEntryDraft[];
  };
  function: {
    musicEnabled: boolean;
    lowBatteryThreshold: string;
    offlineThresholdSeconds: string;
    favoriteLimit: string;
    quickEntryFavorites: boolean;
    autoHomeTimeoutSeconds: string;
    closedMax: string;
    openedMin: string;
  };
  favorites: Array<{
    deviceId: string;
    selected: boolean;
    favoriteOrder: string;
  }>;
}

interface SystemConnectionDraftState {
  connectionMode: string;
  baseUrl: string;
  accessToken: string;
  baseUrlMasked: string | null;
  connectionStatus: string;
  authConfigured: boolean;
  lastTestAt: string | null;
  lastTestResult: string | null;
  lastSyncAt: string | null;
  lastSyncResult: string | null;
}

const DEFAULT_SGCC_SUFFIX = "8170";
const DEFAULT_ENERGY_ACCOUNT_ID = DEFAULT_SGCC_SUFFIX;
const EMPTY_ENERGY_ENTITY_MAP: Record<EnergyEntityMapKey, string> = {
  yesterday_usage: `sensor.last_electricity_usage_${DEFAULT_SGCC_SUFFIX}`,
  monthly_usage: `sensor.month_electricity_usage_${DEFAULT_SGCC_SUFFIX}`,
  balance: `sensor.electricity_charge_balance_${DEFAULT_SGCC_SUFFIX}`,
  yearly_usage: `sensor.yearly_electricity_usage_${DEFAULT_SGCC_SUFFIX}`,
};

function isMediaCandidateDevice(device: DeviceListItemDto) {
  const source =
    `${device.device_type} ${device.display_name} ${device.raw_name ?? ""}`.toLowerCase();
  return (
    source.includes("media") ||
    source.includes("speaker") ||
    source.includes("tv") ||
    source.includes("player")
  );
}

let policyEntryCounter = 0;

function nextPolicyEntryId() {
  policyEntryCounter += 1;
  return `policy-entry-${policyEntryCounter}`;
}

function createEnergyBindingDraft(
  energy: EnergyDto | null = null,
  current?: EnergyBindingDraft,
): EnergyBindingDraft {
  const responseEntityMap = energy?.entity_map ?? {};
  const currentEntityMap = current?.entityMap ?? EMPTY_ENERGY_ENTITY_MAP;
  return {
    accountId: current?.accountId ?? DEFAULT_ENERGY_ACCOUNT_ID,
    entityMap: {
      yesterday_usage:
        responseEntityMap.yesterday_usage ??
        currentEntityMap.yesterday_usage ??
        EMPTY_ENERGY_ENTITY_MAP.yesterday_usage,
      monthly_usage:
        responseEntityMap.monthly_usage ??
        currentEntityMap.monthly_usage ??
        EMPTY_ENERGY_ENTITY_MAP.monthly_usage,
      balance:
        responseEntityMap.balance ??
        currentEntityMap.balance ??
        EMPTY_ENERGY_ENTITY_MAP.balance,
      yearly_usage:
        responseEntityMap.yearly_usage ??
        currentEntityMap.yearly_usage ??
        EMPTY_ENERGY_ENTITY_MAP.yearly_usage,
    },
  };
}

function buildEnergyBindingPayload(draft: EnergyBindingDraft) {
  const entityMap = Object.fromEntries(
    Object.entries(draft.entityMap)
      .map(([key, value]) => [key, value.trim()])
      .filter(([, value]) => value),
  );
  return {
    provider: "HOME_ASSISTANT_SGCC",
    ...(draft.accountId.trim() ? { account_id: draft.accountId.trim() } : {}),
    ...(Object.keys(entityMap).length ? { entity_map: entityMap } : {}),
  };
}

function formatEnergyRefreshMessage(response: EnergyRefreshDto) {
  switch (response.refresh_status_detail) {
    case "SUCCESS_UPDATED":
      return "已完成刷新，HA 源数据已更新。";
    case "SUCCESS_STALE_SOURCE":
      return "已完成刷新，但 HA 源数据未更新。";
    case "FAILED_UPSTREAM_TRIGGER":
      return "触发上游同步失败，请检查 sgcc_electricity_new 或 HA 服务入口配置。";
    case "FAILED_SOURCE_TIMEOUT":
      return "已触发上游同步，但等待 HA 更新超时。";
    default:
      return `刷新任务已完成，状态 ${response.refresh_status}。`;
  }
}

function inferPolicyEntryType(value: unknown): PolicyEntryDraftType {
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (typeof value === "number") {
    return "number";
  }
  if (value !== null && typeof value === "object") {
    return "json";
  }
  return "string";
}

function createPolicyEntries(value: unknown): PolicyEntryDraft[] {
  const record = asRecord(value);
  if (!record) {
    return [];
  }

  return Object.entries(record).map(([key, currentValue]) => {
    const type = inferPolicyEntryType(currentValue);

    return {
      id: nextPolicyEntryId(),
      key,
      type,
      value:
        type === "json"
          ? JSON.stringify(currentValue ?? {}, null, 2)
          : String(currentValue ?? ""),
    };
  });
}

function materializePolicyEntries(
  entries: PolicyEntryDraft[],
  field: string,
): Record<string, unknown> {
  return entries.reduce<Record<string, unknown>>((result, entry) => {
    const key = entry.key.trim();
    if (!key) {
      return result;
    }

    if (entry.type === "boolean") {
      result[key] = entry.value === "true";
      return result;
    }

    if (entry.type === "number") {
      const parsed = Number(entry.value);
      if (!Number.isFinite(parsed)) {
        throw new Error(`${field} "${key}" must be a number.`);
      }
      result[key] = parsed;
      return result;
    }

    if (entry.type === "json") {
      try {
        result[key] = JSON.parse(entry.value || "{}");
      } catch {
        throw new Error(`${field} "${key}" must be valid JSON.`);
      }
      return result;
    }

    result[key] = entry.value;
    return result;
  }, {});
}

function createSettingsDraft(
  data: Record<string, unknown> | null,
): SettingsDraftState {
  const page = asRecord(data?.page_settings);
  const functionSettings = asRecord(data?.function_settings);
  const quickEntryPolicy = asRecord(functionSettings?.quick_entry_policy);
  const thresholds = asRecord(functionSettings?.position_device_thresholds);

  return {
    page: {
      roomLabelMode: asString(page?.room_label_mode ?? "EDIT_ONLY"),
      homepageDisplayPolicy: createPolicyEntries(page?.homepage_display_policy),
      iconPolicy: createPolicyEntries(page?.icon_policy),
      layoutPreference: createPolicyEntries(page?.layout_preference),
    },
    function: {
      musicEnabled: asBoolean(functionSettings?.music_enabled),
      lowBatteryThreshold: String(
        asNumber(functionSettings?.low_battery_threshold, 20),
      ),
      offlineThresholdSeconds: String(
        asNumber(functionSettings?.offline_threshold_seconds, 90),
      ),
      favoriteLimit: String(asNumber(functionSettings?.favorite_limit, 8)),
      quickEntryFavorites: asBoolean(quickEntryPolicy?.favorites, true),
      autoHomeTimeoutSeconds: String(
        asNumber(functionSettings?.auto_home_timeout_seconds, 180),
      ),
      closedMax: String(asNumber(thresholds?.closed_max, 5)),
      openedMin: String(asNumber(thresholds?.opened_min, 95)),
    },
    favorites: asArray<Record<string, unknown>>(data?.favorites).map(
      (favorite, index) => ({
        deviceId: asString(favorite.device_id ?? ""),
        selected: asBoolean(favorite.selected, true),
        favoriteOrder: String(asNumber(favorite.favorite_order, index)),
      }),
    ),
  };
}

function getSettingsVersion(
  data: Record<string, unknown> | null,
): string | null {
  const value = data?.settings_version;
  return typeof value === "string" && value.trim() ? value : null;
}

function createSystemDraft(
  data: SystemConnectionsEnvelopeDto | null,
  previousDraft?: SystemConnectionDraftState | null,
): SystemConnectionDraftState {
  const current = data?.home_assistant ?? null;

  return {
    connectionMode: current?.connection_mode ?? "TOKEN",
    baseUrl: previousDraft?.baseUrl ?? "",
    accessToken: previousDraft?.accessToken ?? "",
    baseUrlMasked: current?.base_url_masked ?? null,
    connectionStatus: current?.connection_status ?? "DISCONNECTED",
    authConfigured: current?.auth_configured ?? false,
    lastTestAt: current?.last_test_at ?? null,
    lastTestResult: current?.last_test_result ?? null,
    lastSyncAt: current?.last_sync_at ?? null,
    lastSyncResult: current?.last_sync_result ?? null,
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
  const [activeTaskFlow, setActiveTaskFlow] =
    useState<SettingsTaskFlowKey>(
      normalizedRequestedSection === "backup" ? "backup-restore" : "new-terminal",
    );
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraftState>(() =>
    createSettingsDraft(null),
  );
  const [draftSourceSettingsVersion, setDraftSourceSettingsVersion] = useState<
    string | null
  >(null);
  const [systemDraft, setSystemDraft] = useState<SystemConnectionDraftState>(
    () => createSystemDraft(null),
  );
  const [systemMessage, setSystemMessage] = useState<string | null>(null);
  const [systemSaveBusy, setSystemSaveBusy] = useState(false);
  const [systemTestBusy, setSystemTestBusy] = useState(false);
  const [systemSyncBusy, setSystemSyncBusy] = useState(false);
  const [energyState, setEnergyState] = useState<EnergyDto | null>(null);
  const [energyDraft, setEnergyDraft] = useState<EnergyBindingDraft>(() =>
    createEnergyBindingDraft(),
  );
  const [energyMessage, setEnergyMessage] = useState<string | null>(null);
  const [energySaveBusy, setEnergySaveBusy] = useState(false);
  const [energyClearBusy, setEnergyClearBusy] = useState(false);
  const [energyRefreshBusy, setEnergyRefreshBusy] = useState(false);
  const [mediaState, setMediaState] = useState<DefaultMediaDto | null>(null);
  const [mediaMessage, setMediaMessage] = useState<string | null>(null);
  const [mediaBindBusy, setMediaBindBusy] = useState(false);
  const [mediaUnbindBusy, setMediaUnbindBusy] = useState(false);
  const [mediaCandidateLoading, setMediaCandidateLoading] = useState(false);
  const [mediaCandidates, setMediaCandidates] = useState<DeviceListItemDto[]>(
    [],
  );
  const [selectedMediaDeviceId, setSelectedMediaDeviceId] = useState("");
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
    loadAudits: loadBootstrapTokenAudits,
    loadDirectory: loadBootstrapTokenDirectory,
    loadInitialDirectory: loadBootstrapTokenDirectoryForSettingsLoad,
    loading: bootstrapTokenLoading,
    pairingClaimBusy,
    pairingClaimFeedback,
    pairingCode: pairingCodeInput,
    claimPairingCode: handleClaimPairingCode,
    reveal: bootstrapTokenReveal,
    selectedTerminalId: selectedBootstrapTerminalId,
    setPairingCode: setPairingCodeInput,
    setSelectedTerminalId: setSelectedBootstrapTerminalId,
  } = useTerminalDelivery({
    canEdit: pin.active,
    currentTerminalId: session.data?.terminalId,
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
  const [showOperationsGuide, setShowOperationsGuide] = useState(false);
  const [showDeliveryDetails, setShowDeliveryDetails] = useState(false);
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

  async function loadSystemConnection() {
    const response = await fetchSystemConnections();
    setSystemDraft((current) => createSystemDraft(response, current));
  }

  useEffect(() => {
    setShowPinManager(false);
    if (activeSection !== "home") {
      setShowHomeContentManager(false);
      setShowHomePublishPanel(false);
      setShowAdvancedEditor(false);
    }
    if (activeSection !== "delivery") {
      setShowDeliveryDetails(false);
    }
    if (activeSection !== "backup") {
      setShowBackupDetails(false);
    }
  }, [activeSection]);

  async function loadEnergyState() {
    const response = await fetchEnergy();
    setEnergyState(response);
    setEnergyDraft((current) => createEnergyBindingDraft(response, current));
  }

  async function loadMediaState() {
    const response = await fetchDefaultMedia();
    setMediaState(response);
    setSelectedMediaDeviceId((current) => current || response.device_id || "");
  }

  async function loadMediaCandidates() {
    setMediaCandidateLoading(true);
    try {
      const response = await fetchDevices({ page: 1, page_size: 200 });
      const candidates = response.items.filter(
        (device) => !device.is_readonly_device,
      );
      const preferredCandidates = candidates.filter(isMediaCandidateDevice);
      const nextCandidates = (
        preferredCandidates.length ? preferredCandidates : candidates
      ).sort((left, right) =>
        left.display_name.localeCompare(right.display_name, "zh-CN"),
      );
      setMediaCandidates(nextCandidates);
    } catch (error) {
      setMediaMessage(normalizeApiError(error).message);
    } finally {
      setMediaCandidateLoading(false);
    }
  }

  async function loadSettings() {
    appStore.setSettingsLoading();
    try {
      const bootstrapDirectoryPromise = loadBootstrapTokenDirectoryForSettingsLoad();
      const [settingsData, systemData] = await Promise.all([
        fetchSettings(),
        fetchSystemConnections(),
        bootstrapDirectoryPromise,
      ]);
      const nextSettingsData = settingsData as unknown as Record<
        string,
        unknown
      >;
      appStore.setSettingsData(nextSettingsData);
      setSettingsDraft(createSettingsDraft(nextSettingsData));
      setDraftSourceSettingsVersion(getSettingsVersion(nextSettingsData));
      setSystemDraft((current) => createSystemDraft(systemData, current));
    } catch (error) {
      appStore.setSettingsError(normalizeApiError(error).message);
    }
  }

  useEffect(() => {
    if (session.status !== "success") {
      return;
    }
    void loadSettings();
    void loadEnergyState().catch((error) => {
      setEnergyMessage(normalizeApiError(error).message);
    });
    void loadMediaState().catch((error) => {
      setMediaMessage(normalizeApiError(error).message);
    });
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
      void loadBootstrapTokenDirectory();
      void loadBootstrapTokenAudits();
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
    const nextVersion = getSettingsVersion(settings.data);
    if (
      !settings.data ||
      !nextVersion ||
      nextVersion === draftSourceSettingsVersion ||
      isSaving
    ) {
      return;
    }
    setSettingsDraft(createSettingsDraft(settings.data));
    setDraftSourceSettingsVersion(nextVersion);
  }, [draftSourceSettingsVersion, isSaving, settings.data]);

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
  const selectedBootstrapTerminal =
    bootstrapTokenDirectory.find(
      (item) => item.terminal_id === selectedBootstrapTerminalId,
    ) ?? null;
  const bootstrapTokenState = selectedBootstrapTerminal;
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
        ? [
            { label: "终端目录", value: `${bootstrapTokenDirectory.length} 台` },
            {
              label: "目标终端",
              value:
                selectedBootstrapTerminal?.terminal_name ??
                selectedBootstrapTerminal?.terminal_code ??
                "-",
            },
            {
              label: "激活凭据",
              value: bootstrapTokenState?.token_configured ? "已就绪" : "待生成",
            },
            { label: "流程说明", value: showOperationsGuide ? "已展开" : "已收起" },
          ]
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

  function updatePageDraft(field: "roomLabelMode", value: string) {
    setSettingsDraft((current) => ({
      ...current,
      page: { ...current.page, [field]: value },
    }));
  }

  function updateFunctionDraft(
    field:
      | "musicEnabled"
      | "lowBatteryThreshold"
      | "offlineThresholdSeconds"
      | "favoriteLimit"
      | "quickEntryFavorites"
      | "autoHomeTimeoutSeconds"
      | "closedMax"
      | "openedMin",
    value: string | boolean,
  ) {
    setSettingsDraft((current) => ({
      ...current,
      function: { ...current.function, [field]: value },
    }));
  }

  function updateFavoriteDraft(
    index: number,
    field: "deviceId" | "selected" | "favoriteOrder",
    value: string | boolean,
  ) {
    setSettingsDraft((current) => ({
      ...current,
      favorites: current.favorites.map((favorite, favoriteIndex) =>
        favoriteIndex === index ? { ...favorite, [field]: value } : favorite,
      ),
    }));
  }

  function addFavoriteDraft() {
    setSettingsDraft((current) => ({
      ...current,
      favorites: [
        ...current.favorites,
        {
          deviceId: "",
          selected: true,
          favoriteOrder: String(current.favorites.length),
        },
      ],
    }));
  }

  function removeFavoriteDraft(index: number) {
    setSettingsDraft((current) => ({
      ...current,
      favorites: current.favorites.filter(
        (_, favoriteIndex) => favoriteIndex !== index,
      ),
    }));
  }

  function updatePolicyDraft(
    policy: "homepageDisplayPolicy" | "iconPolicy" | "layoutPreference",
    index: number,
    field: "key" | "type" | "value",
    value: string,
  ) {
    setSettingsDraft((current) => ({
      ...current,
      page: {
        ...current.page,
        [policy]: current.page[policy].map((entry, entryIndex) => {
          if (entryIndex !== index) {
            return entry;
          }

          if (field === "type") {
            return {
              ...entry,
              type: value as PolicyEntryDraftType,
              value:
                value === "boolean"
                  ? "false"
                  : value === "json"
                    ? entry.type === "json"
                      ? entry.value
                      : "{}"
                    : entry.type === "boolean"
                      ? ""
                      : entry.value,
            };
          }

          return { ...entry, [field]: value };
        }),
      },
    }));
  }

  function addPolicyDraft(
    policy: "homepageDisplayPolicy" | "iconPolicy" | "layoutPreference",
  ) {
    setSettingsDraft((current) => ({
      ...current,
      page: {
        ...current.page,
        [policy]: [
          ...current.page[policy],
          {
            id: nextPolicyEntryId(),
            key: "",
            type: "string",
            value: "",
          },
        ],
      },
    }));
  }

  function removePolicyDraft(
    policy: "homepageDisplayPolicy" | "iconPolicy" | "layoutPreference",
    index: number,
  ) {
    setSettingsDraft((current) => ({
      ...current,
      page: {
        ...current.page,
        [policy]: current.page[policy].filter(
          (_, entryIndex) => entryIndex !== index,
        ),
      },
    }));
  }

  function upsertPolicyDraft(
    policy: "homepageDisplayPolicy" | "iconPolicy" | "layoutPreference",
    key: string,
    type: PolicyEntryDraftType,
    value: string,
  ) {
    setSettingsDraft((current) => {
      const currentEntries = current.page[policy];
      const existingIndex = currentEntries.findIndex(
        (entry) => entry.key === key,
      );
      const nextEntry =
        existingIndex >= 0
          ? { ...currentEntries[existingIndex], type, value }
          : { id: nextPolicyEntryId(), key, type, value };

      return {
        ...current,
        page: {
          ...current.page,
          [policy]:
            existingIndex >= 0
              ? currentEntries.map((entry, index) =>
                  index === existingIndex ? nextEntry : entry,
                )
              : [...currentEntries, nextEntry],
        },
      };
    });
  }

  function updateSystemDraft(
    field: "connectionMode" | "baseUrl" | "accessToken",
    value: string,
  ) {
    setSystemDraft((current) => ({ ...current, [field]: value }));
  }

  async function handleSave() {
    if (!settings.data || !session.data?.terminalId) {
      return;
    }

    setSaveMessage(null);
    setIsSaving(true);
    try {
      const response = await saveSettings({
        settings_version:
          (settings.data.settings_version as string | null | undefined) ?? null,
        page_settings: {
          room_label_mode: settingsDraft.page.roomLabelMode,
          homepage_display_policy: materializePolicyEntries(
            settingsDraft.page.homepageDisplayPolicy,
            "首页展示策略",
          ),
          icon_policy: materializePolicyEntries(
            settingsDraft.page.iconPolicy,
            "图标策略",
          ),
          layout_preference: materializePolicyEntries(
            settingsDraft.page.layoutPreference,
            "布局偏好",
          ),
        },
        function_settings: {
          music_enabled: settingsDraft.function.musicEnabled,
          low_battery_threshold: Number(
            settingsDraft.function.lowBatteryThreshold,
          ),
          offline_threshold_seconds: Number(
            settingsDraft.function.offlineThresholdSeconds,
          ),
          favorite_limit: Number(settingsDraft.function.favoriteLimit),
          quick_entry_policy: {
            favorites: settingsDraft.function.quickEntryFavorites,
          },
          auto_home_timeout_seconds: Number(
            settingsDraft.function.autoHomeTimeoutSeconds,
          ),
          position_device_thresholds: {
            closed_max: Number(settingsDraft.function.closedMax),
            opened_min: Number(settingsDraft.function.openedMin),
          },
        },
        favorites: settingsDraft.favorites
          .filter((favorite) => favorite.deviceId.trim())
          .map((favorite, index) => ({
            device_id: favorite.deviceId.trim(),
            selected: favorite.selected,
            favorite_order: favorite.favoriteOrder.trim()
              ? Number(favorite.favoriteOrder)
              : index,
          })),
      });
      setSaveMessage(
        `保存完成，settings_version 已更新为 ${response.settings_version}。`,
      );
      await loadSettings();
    } catch (error) {
      appStore.setSettingsError(normalizeApiError(error).message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveSystemConnection() {
    if (!pin.active) {
      setSystemMessage("保存 Home Assistant 连接前，请先验证管理 PIN。");
      return;
    }
    if (!systemDraft.baseUrl.trim()) {
      setSystemMessage("请先输入 Home Assistant 地址，再执行保存。");
      return;
    }

    setSystemMessage(null);
    setSystemSaveBusy(true);
    try {
      const response = await saveHomeAssistantConnection({
        connection_mode: systemDraft.connectionMode,
        base_url: systemDraft.baseUrl.trim(),
        auth_payload: {
          access_token: systemDraft.accessToken.trim() || undefined,
        },
      });
      setSystemMessage(response.message);
      await loadSystemConnection();
    } catch (error) {
      setSystemMessage(normalizeApiError(error).message);
    } finally {
      setSystemSaveBusy(false);
    }
  }

  async function handleTestSystemConnection(useSavedConfig: boolean) {
    if (!pin.active) {
      setSystemMessage("测试 Home Assistant 连接前，请先验证管理 PIN。");
      return;
    }

    setSystemMessage(null);
    setSystemTestBusy(true);
    try {
      const response = await testHomeAssistantConnection(
        useSavedConfig
          ? { use_saved_config: true }
          : {
              candidate_config: {
                connection_mode: systemDraft.connectionMode,
                base_url: systemDraft.baseUrl.trim(),
                auth_payload: {
                  access_token: systemDraft.accessToken.trim() || undefined,
                },
              },
            },
      );
      setSystemMessage(
        response.message ??
          `${response.connection_status}，耗时 ${response.latency_ms ?? 0} ms`,
      );
      await loadSystemConnection();
    } catch (error) {
      setSystemMessage(normalizeApiError(error).message);
    } finally {
      setSystemTestBusy(false);
    }
  }

  async function handleSyncHomeAssistantDevices() {
    if (!pin.active) {
      setSystemMessage("同步 Home Assistant 设备前，请先验证管理 PIN。");
      return;
    }

    setSystemMessage(null);
    setSystemSyncBusy(true);
    try {
      const response = await reloadHomeAssistantDevices({
        force_full_sync: true,
      });
      setSystemMessage(response.message);
      await loadSystemConnection();
    } catch (error) {
      setSystemMessage(normalizeApiError(error).message);
    } finally {
      setSystemSyncBusy(false);
    }
  }

  async function handleSaveEnergyBinding() {
    if (!pin.active) {
      setEnergyMessage("保存能耗绑定前，请先验证管理 PIN。");
      return;
    }

    const payload = buildEnergyBindingPayload(energyDraft);
    if (!("account_id" in payload) && !("entity_map" in payload)) {
      setEnergyMessage("请填写国家电网户号，或至少填写一个 Home Assistant 实体映射。");
      return;
    }

    setEnergyMessage(null);
    setEnergySaveBusy(true);
    try {
      const response = await saveEnergyBinding({ payload });
      setEnergyMessage(response.message);
      await Promise.all([loadEnergyState(), loadSettings()]);
    } catch (error) {
      setEnergyMessage(normalizeApiError(error).message);
    } finally {
      setEnergySaveBusy(false);
    }
  }

  async function handleClearEnergyBinding() {
    if (!pin.active) {
      setEnergyMessage("清除能耗绑定前，请先验证管理 PIN。");
      return;
    }

    setEnergyMessage(null);
    setEnergyClearBusy(true);
    try {
      const response = await clearEnergyBinding();
      setEnergyMessage(response.message);
      await Promise.all([loadEnergyState(), loadSettings()]);
      setEnergyDraft(createEnergyBindingDraft());
    } catch (error) {
      setEnergyMessage(normalizeApiError(error).message);
    } finally {
      setEnergyClearBusy(false);
    }
  }

  async function handleRefreshEnergy() {
    if (!pin.active) {
      setEnergyMessage("刷新能耗前，请先验证管理 PIN。");
      return;
    }

    setEnergyMessage("正在触发上游同步并等待 HA 更新...");
    setEnergyRefreshBusy(true);
    try {
      const response = await refreshEnergy();
      setEnergyMessage(formatEnergyRefreshMessage(response));
      await Promise.all([loadEnergyState(), loadSettings()]);
    } catch (error) {
      setEnergyMessage(normalizeApiError(error).message);
    } finally {
      setEnergyRefreshBusy(false);
    }
  }

  async function handleBindDefaultMedia() {
    if (!pin.active) {
      setMediaMessage("绑定默认媒体前，请先验证管理 PIN。");
      return;
    }
    if (!selectedMediaDeviceId) {
      setMediaMessage("请先选择一个媒体设备。");
      return;
    }

    setMediaMessage(null);
    setMediaBindBusy(true);
    try {
      const response = await bindDefaultMedia({
        device_id: selectedMediaDeviceId,
      });
      setMediaMessage(
        response.display_name
          ? `默认媒体已切换为 ${response.display_name}。`
          : "默认媒体已更新。",
      );
      await Promise.all([loadMediaState(), loadSettings()]);
    } catch (error) {
      setMediaMessage(normalizeApiError(error).message);
    } finally {
      setMediaBindBusy(false);
    }
  }

  async function handleUnbindDefaultMedia() {
    if (!pin.active) {
      setMediaMessage("清除默认媒体前，请先验证管理 PIN。");
      return;
    }

    setMediaMessage(null);
    setMediaUnbindBusy(true);
    try {
      await unbindDefaultMedia();
      setSelectedMediaDeviceId("");
      setMediaMessage("默认媒体已清除。");
      await Promise.all([loadMediaState(), loadSettings()]);
    } catch (error) {
      setMediaMessage(normalizeApiError(error).message);
    } finally {
      setMediaUnbindBusy(false);
    }
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
          onChangeAccountId={(value) =>
            setEnergyDraft((current) => ({ ...current, accountId: value }))
          }
          onChangeEntity={(key, value) =>
            setEnergyDraft((current) => ({
              ...current,
              entityMap: { ...current.entityMap, [key]: value },
            }))
          }
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
          rows={[
            { label: "终端目录", value: `${bootstrapTokenDirectory.length} 台` },
            {
              label: "目标终端",
              value:
                selectedBootstrapTerminal?.terminal_name ??
                selectedBootstrapTerminal?.terminal_code ??
                "-",
            },
            {
              label: "详情面板",
              value: showDeliveryDetails ? "已展开" : "已收起",
            },
          ]}
          actions={
            <button
              className="button button--ghost"
              onClick={() => setShowDeliveryDetails((current) => !current)}
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
