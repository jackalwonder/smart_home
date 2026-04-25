import { useState } from "react";
import { fetchDevices } from "../../api/devicesApi";
import { normalizeApiError } from "../../api/httpClient";
import {
  bindDefaultMedia,
  fetchDefaultMedia,
  unbindDefaultMedia,
} from "../../api/mediaApi";
import type { DefaultMediaDto, DeviceListItemDto } from "../../api/types";
import {
  IntegrationHookOptions,
  isMediaCandidateDevice,
} from "./settingsIntegrationModels";

export function useDefaultMediaSettings({
  canEdit,
  onSettingsReload,
}: IntegrationHookOptions) {
  const [mediaState, setMediaState] = useState<DefaultMediaDto | null>(null);
  const [mediaMessage, setMediaMessage] = useState<string | null>(null);
  const [mediaBindBusy, setMediaBindBusy] = useState(false);
  const [mediaUnbindBusy, setMediaUnbindBusy] = useState(false);
  const [mediaCandidateLoading, setMediaCandidateLoading] = useState(false);
  const [mediaCandidates, setMediaCandidates] = useState<DeviceListItemDto[]>([]);
  const [selectedMediaDeviceId, setSelectedMediaDeviceId] = useState("");

  async function loadMediaState() {
    try {
      const response = await fetchDefaultMedia();
      setMediaState(response);
      setSelectedMediaDeviceId((current) => current || response.device_id || "");
    } catch (error) {
      setMediaMessage(normalizeApiError(error).message);
    }
  }

  async function loadMediaCandidates() {
    setMediaCandidateLoading(true);
    try {
      const response = await fetchDevices({ page: 1, page_size: 200 });
      const candidates = response.items.filter((device) => !device.is_readonly_device);
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
    handleBindDefaultMedia,
    handleUnbindDefaultMedia,
    loadMediaCandidates,
    loadMediaState,
    mediaBindBusy,
    mediaCandidateLoading,
    mediaCandidates,
    mediaMessage,
    mediaState,
    mediaUnbindBusy,
    selectedMediaDeviceId,
    setSelectedMediaDeviceId,
  };
}
