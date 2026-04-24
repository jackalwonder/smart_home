import { useState } from "react";
import { fetchDevices } from "../../api/devicesApi";
import {
  clearEnergyBinding,
  fetchEnergy,
  refreshEnergy,
  saveEnergyBinding,
} from "../../api/energyApi";
import {
  bindDefaultMedia,
  fetchDefaultMedia,
  unbindDefaultMedia,
} from "../../api/mediaApi";
import {
  fetchSystemConnections,
  reloadHomeAssistantDevices,
  saveHomeAssistantConnection,
  testHomeAssistantConnection,
} from "../../api/systemConnectionsApi";
import { normalizeApiError } from "../../api/httpClient";
import type {
  DefaultMediaDto,
  DeviceListItemDto,
  EnergyDto,
  EnergyRefreshDto,
  SystemConnectionsEnvelopeDto,
} from "../../api/types";
import type {
  EnergyBindingDraft,
  EnergyEntityMapKey,
} from "../../components/settings/EnergyBindingPanel";

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

interface UseSettingsIntegrationsOptions {
  canEdit: boolean;
  onSettingsReload: () => Promise<void>;
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
    provider: "SGCC_SIDECAR",
    ...(draft.accountId.trim() ? { account_id: draft.accountId.trim() } : {}),
    ...(Object.keys(entityMap).length ? { entity_map: entityMap } : {}),
  };
}

function formatEnergyRefreshMessage(response: EnergyRefreshDto) {
  switch (response.refresh_status_detail) {
    case "SUCCESS_UPDATED":
      return "已完成刷新，HA 源数据已更新。";
    case "SUCCESS_STALE_SOURCE":
      return "已完成刷新，但源数据未更新。";
    case "FAILED_UPSTREAM_TRIGGER":
      return "触发上游同步失败，请检查 sgcc_electricity_new 或 HA 服务入口配置。";
    case "FAILED_SOURCE_TIMEOUT":
      return "已触发上游同步，但等待 HA 更新超时。";
    default:
      return `刷新任务已完成，状态 ${response.refresh_status}。`;
  }
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

export function useSettingsIntegrations({
  canEdit,
  onSettingsReload,
}: UseSettingsIntegrationsOptions) {
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

  function applySystemConnection(response: SystemConnectionsEnvelopeDto) {
    setSystemDraft((current) => createSystemDraft(response, current));
  }

  async function loadSystemConnection() {
    const response = await fetchSystemConnections();
    applySystemConnection(response);
  }

  async function loadEnergyState() {
    try {
      const response = await fetchEnergy();
      setEnergyState(response);
      setEnergyDraft((current) => createEnergyBindingDraft(response, current));
    } catch (error) {
      setEnergyMessage(normalizeApiError(error).message);
    }
  }

  async function loadMediaState() {
    try {
      const response = await fetchDefaultMedia();
      setMediaState(response);
      setSelectedMediaDeviceId(
        (current) => current || response.device_id || "",
      );
    } catch (error) {
      setMediaMessage(normalizeApiError(error).message);
    }
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

  function updateSystemDraft(
    field: "connectionMode" | "baseUrl" | "accessToken",
    value: string,
  ) {
    setSystemDraft((current) => ({ ...current, [field]: value }));
  }

  function updateEnergyAccountId(value: string) {
    setEnergyDraft((current) => ({ ...current, accountId: value }));
  }

  function updateEnergyEntity(key: EnergyEntityMapKey, value: string) {
    setEnergyDraft((current) => ({
      ...current,
      entityMap: { ...current.entityMap, [key]: value },
    }));
  }

  async function handleSaveSystemConnection() {
    if (!canEdit) {
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
    if (!canEdit) {
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
    if (!canEdit) {
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
    if (!canEdit) {
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
      await Promise.all([loadEnergyState(), onSettingsReload()]);
    } catch (error) {
      setEnergyMessage(normalizeApiError(error).message);
    } finally {
      setEnergySaveBusy(false);
    }
  }

  async function handleClearEnergyBinding() {
    if (!canEdit) {
      setEnergyMessage("清除能耗绑定前，请先验证管理 PIN。");
      return;
    }

    setEnergyMessage(null);
    setEnergyClearBusy(true);
    try {
      const response = await clearEnergyBinding();
      setEnergyMessage(response.message);
      await Promise.all([loadEnergyState(), onSettingsReload()]);
      setEnergyDraft(createEnergyBindingDraft());
    } catch (error) {
      setEnergyMessage(normalizeApiError(error).message);
    } finally {
      setEnergyClearBusy(false);
    }
  }

  async function handleRefreshEnergy() {
    if (!canEdit) {
      setEnergyMessage("刷新能耗前，请先验证管理 PIN。");
      return;
    }

    setEnergyMessage("正在触发上游同步并等待 HA 更新...");
    setEnergyRefreshBusy(true);
    try {
      const response = await refreshEnergy();
      setEnergyMessage(formatEnergyRefreshMessage(response));
      await Promise.all([loadEnergyState(), onSettingsReload()]);
    } catch (error) {
      setEnergyMessage(normalizeApiError(error).message);
    } finally {
      setEnergyRefreshBusy(false);
    }
  }

  async function handleBindDefaultMedia() {
    if (!canEdit) {
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
      await Promise.all([loadMediaState(), onSettingsReload()]);
    } catch (error) {
      setMediaMessage(normalizeApiError(error).message);
    } finally {
      setMediaBindBusy(false);
    }
  }

  async function handleUnbindDefaultMedia() {
    if (!canEdit) {
      setMediaMessage("清除默认媒体前，请先验证管理 PIN。");
      return;
    }

    setMediaMessage(null);
    setMediaUnbindBusy(true);
    try {
      await unbindDefaultMedia();
      setSelectedMediaDeviceId("");
      setMediaMessage("默认媒体已清除。");
      await Promise.all([loadMediaState(), onSettingsReload()]);
    } catch (error) {
      setMediaMessage(normalizeApiError(error).message);
    } finally {
      setMediaUnbindBusy(false);
    }
  }

  return {
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
  };
}
