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

export interface SystemConnectionDraftState {
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

export interface IntegrationHookOptions {
  canEdit: boolean;
  onSettingsReload: () => Promise<void>;
}

export const DEFAULT_SGCC_SUFFIX = "8170";
export const DEFAULT_ENERGY_ACCOUNT_ID = DEFAULT_SGCC_SUFFIX;
export const EMPTY_ENERGY_ENTITY_MAP: Record<EnergyEntityMapKey, string> = {
  yesterday_usage: `sensor.last_electricity_usage_${DEFAULT_SGCC_SUFFIX}`,
  monthly_usage: `sensor.month_electricity_usage_${DEFAULT_SGCC_SUFFIX}`,
  balance: `sensor.electricity_charge_balance_${DEFAULT_SGCC_SUFFIX}`,
  yearly_usage: `sensor.yearly_electricity_usage_${DEFAULT_SGCC_SUFFIX}`,
};

export function inferEnergyAccountIdFromEntities(
  entityMap: Partial<Record<EnergyEntityMapKey, string>>,
) {
  const suffix = Object.values(entityMap)
    .map((entity) => entity?.match(/_(\d+)$/)?.[1] ?? "")
    .find(Boolean);
  return suffix || null;
}

export function isMediaCandidateDevice(device: DeviceListItemDto) {
  const source =
    `${device.device_type} ${device.display_name} ${device.raw_name ?? ""}`.toLowerCase();
  return (
    source.includes("media") ||
    source.includes("speaker") ||
    source.includes("tv") ||
    source.includes("player")
  );
}

export function createEnergyBindingDraft(
  energy: EnergyDto | null = null,
  current?: EnergyBindingDraft,
): EnergyBindingDraft {
  const responseEntityMap = energy?.entity_map ?? {};
  const currentEntityMap = current?.entityMap ?? EMPTY_ENERGY_ENTITY_MAP;
  const inferredAccountId = inferEnergyAccountIdFromEntities(responseEntityMap);
  return {
    accountId: current?.accountId ?? inferredAccountId ?? DEFAULT_ENERGY_ACCOUNT_ID,
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

export function buildEnergyBindingPayload(draft: EnergyBindingDraft) {
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

export function formatEnergyRefreshMessage(response: EnergyRefreshDto) {
  switch (response.refresh_status_detail) {
    case "SUCCESS_UPDATED":
      return response.upstream_triggered
        ? "已完成刷新，HA 源数据已更新。"
        : "已从 HA 实体或 SGCC 缓存读取最新能耗。";
    case "SUCCESS_STALE_SOURCE":
      return response.upstream_triggered
        ? "已完成刷新，但源数据未更新。"
        : "已完成本地刷新，但 HA 实体/缓存没有比当前快照更新的数据。";
    case "FAILED_UPSTREAM_TRIGGER":
      return "触发上游同步失败，请检查 sgcc_electricity_new 或 HA 服务入口配置。";
    case "FAILED_SOURCE_TIMEOUT":
      return "已触发上游同步，但等待 HA 更新超时。";
    default:
      return `刷新任务已完成，状态 ${response.refresh_status}。`;
  }
}

export function createSystemDraft(
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

export type DefaultMediaState = DefaultMediaDto | null;
