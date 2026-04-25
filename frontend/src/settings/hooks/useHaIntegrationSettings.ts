import { useState } from "react";
import { normalizeApiError } from "../../api/httpClient";
import {
  fetchSystemConnections,
  reloadHomeAssistantDevices,
  saveHomeAssistantConnection,
  testHomeAssistantConnection,
} from "../../api/systemConnectionsApi";
import {
  IntegrationHookOptions,
  SystemConnectionDraftState,
  createSystemDraft,
} from "./settingsIntegrationModels";

export function useHaIntegrationSettings({ canEdit }: IntegrationHookOptions) {
  const [systemDraft, setSystemDraft] = useState<SystemConnectionDraftState>(
    () => createSystemDraft(null),
  );
  const [systemMessage, setSystemMessage] = useState<string | null>(null);
  const [systemSaveBusy, setSystemSaveBusy] = useState(false);
  const [systemTestBusy, setSystemTestBusy] = useState(false);
  const [systemSyncBusy, setSystemSyncBusy] = useState(false);

  function applySystemConnection(response: Awaited<ReturnType<typeof fetchSystemConnections>>) {
    setSystemDraft((current) => createSystemDraft(response, current));
  }

  async function loadSystemConnection() {
    const response = await fetchSystemConnections();
    applySystemConnection(response);
  }

  function updateSystemDraft(
    field: "connectionMode" | "baseUrl" | "accessToken",
    value: string,
  ) {
    setSystemDraft((current) => ({ ...current, [field]: value }));
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

  return {
    handleSaveSystemConnection,
    handleSyncHomeAssistantDevices,
    handleTestSystemConnection,
    loadSystemConnection,
    systemDraft,
    systemMessage,
    systemSaveBusy,
    systemSyncBusy,
    systemTestBusy,
    updateSystemDraft,
  };
}
