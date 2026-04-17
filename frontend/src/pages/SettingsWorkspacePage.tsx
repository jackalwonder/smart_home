import { useEffect, useState } from "react";
import {
  createBackup,
  fetchBackupRestoreAudits,
  fetchBackups,
  restoreBackup,
} from "../api/backupsApi";
import { fetchSettings, saveSettings } from "../api/settingsApi";
import {
  fetchSystemConnections,
  reloadHomeAssistantDevices,
  saveHomeAssistantConnection,
  testHomeAssistantConnection,
} from "../api/systemConnectionsApi";
import {
  BackupListItemDto,
  BackupRestoreAuditItemDto,
  SystemConnectionsEnvelopeDto,
} from "../api/types";
import { normalizeApiError } from "../api/httpClient";
import { PinAccessCard } from "../components/auth/PinAccessCard";
import { PageFrame } from "../components/layout/PageFrame";
import { BackupManagementPanel } from "../components/settings/BackupManagementPanel";
import { FavoritesDevicePanel } from "../components/settings/FavoritesDevicePanel";
import { FunctionSettingsPanel } from "../components/settings/FunctionSettingsPanel";
import { PageSettingsPanel } from "../components/settings/PageSettingsPanel";
import { SettingsActionDock } from "../components/settings/SettingsActionDock";
import { SettingsHeaderBar } from "../components/settings/SettingsHeaderBar";
import { SettingsOverviewCard } from "../components/settings/SettingsOverviewCard";
import { SettingsShowcaseGrid } from "../components/settings/SettingsShowcaseGrid";
import { SettingsSideNav } from "../components/settings/SettingsSideNav";
import {
  PolicyEntryDraft,
  PolicyEntryDraftType,
} from "../components/settings/StructuredPolicyEditor";
import { SystemConnectionPanel } from "../components/settings/SystemConnectionPanel";
import { appStore, useAppStore } from "../store/useAppStore";
import { SettingsSectionViewModel, mapSettingsViewModel } from "../view-models/settings";
import { asArray, asBoolean, asNumber, asRecord, asString } from "../view-models/utils";

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

let policyEntryCounter = 0;

function nextPolicyEntryId() {
  policyEntryCounter += 1;
  return `policy-entry-${policyEntryCounter}`;
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

function createSettingsDraft(data: Record<string, unknown> | null): SettingsDraftState {
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
      lowBatteryThreshold: String(asNumber(functionSettings?.low_battery_threshold, 20)),
      offlineThresholdSeconds: String(asNumber(functionSettings?.offline_threshold_seconds, 90)),
      favoriteLimit: String(asNumber(functionSettings?.favorite_limit, 8)),
      quickEntryFavorites: asBoolean(quickEntryPolicy?.favorites, true),
      autoHomeTimeoutSeconds: String(
        asNumber(functionSettings?.auto_home_timeout_seconds, 180),
      ),
      closedMax: String(asNumber(thresholds?.closed_max, 5)),
      openedMin: String(asNumber(thresholds?.opened_min, 95)),
    },
    favorites: asArray<Record<string, unknown>>(data?.favorites).map((favorite, index) => ({
      deviceId: asString(favorite.device_id ?? ""),
      selected: asBoolean(favorite.selected, true),
      favoriteOrder: String(asNumber(favorite.favorite_order, index)),
    })),
  };
}

function getSettingsVersion(data: Record<string, unknown> | null): string | null {
  const value = data?.settings_version;
  return typeof value === "string" && value.trim() ? value : null;
}

function createSystemDraft(data: SystemConnectionsEnvelopeDto | null): SystemConnectionDraftState {
  const current = data?.home_assistant ?? null;

  return {
    connectionMode: current?.connection_mode ?? "TOKEN",
    baseUrl: "",
    accessToken: "",
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
  const [activeSection, setActiveSection] = useState<SettingsSectionViewModel["key"]>("favorites");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraftState>(() =>
    createSettingsDraft(null),
  );
  const [draftSourceSettingsVersion, setDraftSourceSettingsVersion] = useState<string | null>(null);
  const [systemDraft, setSystemDraft] = useState<SystemConnectionDraftState>(() =>
    createSystemDraft(null),
  );
  const [systemMessage, setSystemMessage] = useState<string | null>(null);
  const [systemSaveBusy, setSystemSaveBusy] = useState(false);
  const [systemTestBusy, setSystemTestBusy] = useState(false);
  const [systemSyncBusy, setSystemSyncBusy] = useState(false);
  const [backupItems, setBackupItems] = useState<BackupListItemDto[]>([]);
  const [backupNote, setBackupNote] = useState("");
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupRestoreAudits, setBackupRestoreAudits] = useState<BackupRestoreAuditItemDto[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupAuditLoading, setBackupAuditLoading] = useState(false);
  const [backupCreateBusy, setBackupCreateBusy] = useState(false);
  const [backupRestoreBusyId, setBackupRestoreBusyId] = useState<string | null>(null);

  async function loadSystemConnection() {
    const response = await fetchSystemConnections();
    setSystemDraft(createSystemDraft(response));
  }

  async function loadSettings() {
    appStore.setSettingsLoading();
    try {
      const [settingsData, systemData] = await Promise.all([
        fetchSettings(),
        fetchSystemConnections(),
      ]);
      const nextSettingsData = settingsData as unknown as Record<string, unknown>;
      appStore.setSettingsData(nextSettingsData);
      setSettingsDraft(createSettingsDraft(nextSettingsData));
      setDraftSourceSettingsVersion(getSettingsVersion(nextSettingsData));
      setSystemDraft(createSystemDraft(systemData));
    } catch (error) {
      appStore.setSettingsError(normalizeApiError(error).message);
    }
  }

  async function loadBackups() {
    if (!pin.active) {
      setBackupItems([]);
      return;
    }

    setBackupLoading(true);
    try {
      const response = await fetchBackups();
      setBackupItems(response.items);
    } catch (error) {
      setBackupMessage(normalizeApiError(error).message);
    } finally {
      setBackupLoading(false);
    }
  }

  async function loadBackupRestoreAudits() {
    if (!pin.active) {
      setBackupRestoreAudits([]);
      return;
    }

    setBackupAuditLoading(true);
    try {
      const response = await fetchBackupRestoreAudits();
      setBackupRestoreAudits(response.items);
    } catch (error) {
      setBackupMessage(normalizeApiError(error).message);
    } finally {
      setBackupAuditLoading(false);
    }
  }

  useEffect(() => {
    if (session.status !== "success") {
      return;
    }
    void loadSettings();
  }, [session.data?.accessToken, session.status]);

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

  const viewModel = mapSettingsViewModel(settings.data);
  const overviewRows = [
    ...viewModel.overview,
    { label: "HA 连接", value: systemDraft.connectionStatus },
    { label: "备份", value: `${backupItems.length} 条` },
    { label: "恢复审计", value: `${backupRestoreAudits.length} 条` },
  ];
  const activeSectionConfig =
    viewModel.sections.find((section) => section.key === activeSection) ?? viewModel.sections[0];

  const canSave =
    Boolean(session.data?.terminalId) &&
    pin.active &&
    Boolean(settings.data);

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
      favorites: current.favorites.filter((_, favoriteIndex) => favoriteIndex !== index),
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

  function addPolicyDraft(policy: "homepageDisplayPolicy" | "iconPolicy" | "layoutPreference") {
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
        [policy]: current.page[policy].filter((_, entryIndex) => entryIndex !== index),
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
      const existingIndex = currentEntries.findIndex((entry) => entry.key === key);
      const nextEntry = existingIndex >= 0
        ? { ...currentEntries[existingIndex], type, value }
        : { id: nextPolicyEntryId(), key, type, value };

      return {
        ...current,
        page: {
          ...current.page,
          [policy]:
            existingIndex >= 0
              ? currentEntries.map((entry, index) => (index === existingIndex ? nextEntry : entry))
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
        settings_version: (settings.data.settings_version as string | null | undefined) ?? null,
        page_settings: {
          room_label_mode: settingsDraft.page.roomLabelMode,
          homepage_display_policy: materializePolicyEntries(
            settingsDraft.page.homepageDisplayPolicy,
            "首页展示策略",
          ),
          icon_policy: materializePolicyEntries(settingsDraft.page.iconPolicy, "图标策略"),
          layout_preference: materializePolicyEntries(
            settingsDraft.page.layoutPreference,
            "布局偏好",
          ),
        },
        function_settings: {
          music_enabled: settingsDraft.function.musicEnabled,
          low_battery_threshold: Number(settingsDraft.function.lowBatteryThreshold),
          offline_threshold_seconds: Number(settingsDraft.function.offlineThresholdSeconds),
          favorite_limit: Number(settingsDraft.function.favoriteLimit),
          quick_entry_policy: {
            favorites: settingsDraft.function.quickEntryFavorites,
          },
          auto_home_timeout_seconds: Number(settingsDraft.function.autoHomeTimeoutSeconds),
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
      setSaveMessage(`保存完成，settings_version 已更新为 ${response.settings_version}。`);
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
      const response = await reloadHomeAssistantDevices({ force_full_sync: true });
      setSystemMessage(response.message);
      await loadSystemConnection();
    } catch (error) {
      setSystemMessage(normalizeApiError(error).message);
    } finally {
      setSystemSyncBusy(false);
    }
  }

  async function handleCreateBackup() {
    if (!pin.active) {
      setBackupMessage("创建备份前，请先验证管理 PIN。");
      return;
    }

    setBackupMessage(null);
    setBackupCreateBusy(true);
    try {
      const response = await createBackup({
        note: backupNote.trim() || undefined,
      });
      setBackupNote("");
      setBackupMessage(`备份 ${response.backup_id} 已创建。`);
      await loadBackups();
    } catch (error) {
      setBackupMessage(normalizeApiError(error).message);
    } finally {
      setBackupCreateBusy(false);
    }
  }

  async function handleRestoreBackup(backup: BackupListItemDto) {
    if (!pin.active) {
      setBackupMessage("恢复备份前，请先验证管理 PIN。");
      return;
    }
    const summary = backup.summary;
    const comparison = backup.comparison;
    const confirmCopy = [
      `恢复备份 ${backup.backup_id} 会生成新的设置和布局版本。`,
      `快照设置版本 ${summary.settings_version ?? "-"}，当前 ${comparison.current_settings_version ?? "-"}。`,
      `快照布局版本 ${summary.layout_version ?? "-"}，当前 ${comparison.current_layout_version ?? "-"}。`,
      `包含收藏 ${summary.favorite_count} 个，热点 ${summary.hotspot_count} 个。`,
      "是否继续？",
    ].join("\n");
    if (!window.confirm(confirmCopy)) {
      return;
    }

    setBackupMessage(null);
    setBackupRestoreBusyId(backup.backup_id);
    try {
      const response = await restoreBackup(backup.backup_id);
      setBackupMessage(
        `恢复完成，audit_id ${response.audit_id}，settings_version ${response.settings_version}。`,
      );
      await Promise.all([loadSettings(), loadBackups(), loadBackupRestoreAudits()]);
    } catch (error) {
      setBackupMessage(normalizeApiError(error).message);
      await loadBackupRestoreAudits();
    } finally {
      setBackupRestoreBusyId(null);
    }
  }

  let sectionPanel = (
    <FavoritesDevicePanel
      favorites={settingsDraft.favorites}
      onAddFavorite={addFavoriteDraft}
      onRemoveFavorite={removeFavoriteDraft}
      onUpdateFavorite={updateFavoriteDraft}
    />
  );
  if (activeSection === "system") {
    sectionPanel = (
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
    );
  } else if (activeSection === "page") {
    sectionPanel = (
      <PageSettingsPanel
        draft={settingsDraft.page}
        onAddPolicyEntry={addPolicyDraft}
        onChangePolicyEntry={updatePolicyDraft}
        onChangeRoomLabelMode={(value) => updatePageDraft("roomLabelMode", value)}
        onRemovePolicyEntry={removePolicyDraft}
        onSetPolicyValue={upsertPolicyDraft}
      />
    );
  } else if (activeSection === "function") {
    sectionPanel = (
      <FunctionSettingsPanel draft={settingsDraft.function} onChange={updateFunctionDraft} />
    );
  } else if (activeSection === "backup") {
    sectionPanel = (
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
              onSelectSection={setActiveSection}
              sections={viewModel.sections}
            />
            <SettingsActionDock
              canSave={canSave}
              onSave={() => void handleSave()}
              pinRequired={viewModel.pinRequired}
              saveMessage={saveMessage}
              saving={isSaving}
              version={viewModel.version}
            />
            <PinAccessCard />
          </div>
        }
        asidePosition="left"
        className="page-frame--settings"
      >
        <div
          className={
            activeSection === "favorites"
              ? "settings-showcase-shell is-favorites"
              : "settings-showcase-shell"
          }
        >
          <SettingsHeaderBar
            description={activeSectionConfig.description}
            status={settings.status}
            title={activeSectionConfig.label}
            version={viewModel.version}
          />
          {activeSection === "favorites" ? <SettingsShowcaseGrid /> : null}
          <SettingsOverviewCard rows={overviewRows} />
        </div>
        {sectionPanel}
      </PageFrame>
    </section>
  );
}
