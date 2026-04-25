import { useState } from "react";
import {
  clearEnergyBinding,
  fetchEnergy,
  refreshEnergy,
  saveEnergyBinding,
} from "../../api/energyApi";
import { normalizeApiError } from "../../api/httpClient";
import type { EnergyDto } from "../../api/types";
import type { EnergyEntityMapKey } from "../../components/settings/EnergyBindingPanel";
import {
  IntegrationHookOptions,
  buildEnergyBindingPayload,
  createEnergyBindingDraft,
  formatEnergyRefreshMessage,
} from "./settingsIntegrationModels";

export function useEnergyIntegrationSettings({
  canEdit,
  onSettingsReload,
}: IntegrationHookOptions) {
  const [energyState, setEnergyState] = useState<EnergyDto | null>(null);
  const [energyDraft, setEnergyDraft] = useState(() => createEnergyBindingDraft());
  const [energyMessage, setEnergyMessage] = useState<string | null>(null);
  const [energySaveBusy, setEnergySaveBusy] = useState(false);
  const [energyClearBusy, setEnergyClearBusy] = useState(false);
  const [energyRefreshBusy, setEnergyRefreshBusy] = useState(false);

  async function loadEnergyState() {
    try {
      const response = await fetchEnergy();
      setEnergyState(response);
      setEnergyDraft((current) => createEnergyBindingDraft(response, current));
    } catch (error) {
      setEnergyMessage(normalizeApiError(error).message);
    }
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

  return {
    energyClearBusy,
    energyDraft,
    energyMessage,
    energyRefreshBusy,
    energySaveBusy,
    energyState,
    handleClearEnergyBinding,
    handleRefreshEnergy,
    handleSaveEnergyBinding,
    loadEnergyState,
    updateEnergyAccountId,
    updateEnergyEntity,
  };
}
