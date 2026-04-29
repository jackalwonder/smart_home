import { useCallback, useEffect, useState } from "react";
import { normalizeApiError } from "../../api/httpClient";
import {
  bindSgccEnergyAccount,
  fetchSgccLoginQrCodeImage,
  fetchSgccLoginQrCodeStatus,
  pullSgccEnergyData,
  regenerateSgccLoginQrCode,
} from "../../api/settingsApi";
import type { SgccLoginQrCodeStatusDto } from "../../api/types";
import { formatEnergyRefreshMessage } from "./settingsIntegrationModels";

interface UseSgccLoginQrCodeOptions {
  canEdit: boolean;
  onEnergyAccountBound: () => Promise<void>;
}

export function useSgccLoginQrCode({
  canEdit,
  onEnergyAccountBound,
}: UseSgccLoginQrCodeOptions) {
  const [status, setStatus] = useState<SgccLoginQrCodeStatusDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [regenerateBusy, setRegenerateBusy] = useState(false);
  const [bindBusy, setBindBusy] = useState(false);
  const [pullBusy, setPullBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const replaceImageUrl = useCallback((nextUrl: string | null) => {
    setImageUrl((current) => {
      if (current?.startsWith("blob:")) {
        URL.revokeObjectURL(current);
      }
      return nextUrl;
    });
  }, []);

  const loadStatus = useCallback(
    async (options?: { quiet?: boolean }) => {
      if (!options?.quiet) {
        setLoading(true);
      }

      try {
        const response = await fetchSgccLoginQrCodeStatus();
        setStatus(response);
        setMessage(null);

        if (!response.available || !response.image_url) {
          replaceImageUrl(null);
          return;
        }

        const shouldReloadImage = response.updated_at !== status?.updated_at || !imageUrl;
        if (!shouldReloadImage) {
          return;
        }

        const imageBlob = await fetchSgccLoginQrCodeImage(response.image_url);
        replaceImageUrl(URL.createObjectURL(imageBlob));
      } catch (error) {
        setMessage(normalizeApiError(error).message);
      } finally {
        if (!options?.quiet) {
          setLoading(false);
        }
      }
    },
    [imageUrl, replaceImageUrl, status?.updated_at],
  );

  const regenerate = useCallback(async () => {
    if (!canEdit) {
      setMessage("重新生成国网二维码前，请先验证管理 PIN。");
      return;
    }

    setRegenerateBusy(true);
    setMessage(null);
    replaceImageUrl(null);
    try {
      const response = await regenerateSgccLoginQrCode();
      setStatus(response);
    } catch (error) {
      setMessage(normalizeApiError(error).message);
    } finally {
      setRegenerateBusy(false);
    }
  }, [canEdit, replaceImageUrl]);

  const bindEnergyAccount = useCallback(async () => {
    if (!canEdit) {
      setMessage("绑定国网账号前，请先验证管理 PIN。");
      return;
    }

    setBindBusy(true);
    setMessage(null);
    try {
      const response = await bindSgccEnergyAccount();
      setStatus(response);
      await onEnergyAccountBound();
    } catch (error) {
      setMessage(normalizeApiError(error).message);
    } finally {
      setBindBusy(false);
    }
  }, [canEdit, onEnergyAccountBound]);

  const pullEnergyData = useCallback(async () => {
    if (!canEdit) {
      setMessage("拉取国网能耗前，请先验证管理 PIN。");
      return;
    }

    setPullBusy(true);
    setMessage("正在拉取国网数据，并同步到 HA 实体与本地缓存...");
    try {
      const response = await pullSgccEnergyData();
      setStatus(response.sgcc_status);
      setMessage(formatEnergyRefreshMessage(response.energy_refresh));
      await onEnergyAccountBound();
    } catch (error) {
      setMessage(normalizeApiError(error).message);
    } finally {
      setPullBusy(false);
    }
  }, [canEdit, onEnergyAccountBound]);

  useEffect(() => {
    return () => {
      if (imageUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  return {
    bindBusy,
    bindEnergyAccount,
    imageUrl,
    loadStatus,
    loading,
    message,
    pullBusy,
    pullEnergyData,
    regenerate,
    regenerateBusy,
    status,
  };
}
