import { useMemo } from "react";
import { buildSettingsRuntimeCards } from "../runtimeOverview";
import type { SettingsSectionViewModel } from "../../view-models/settings";
import type {
  BackupListItemDto,
  DefaultMediaDto,
  EnergyDto,
  SgccLoginQrCodeStatusDto,
} from "../../api/types";

interface UseSettingsOverviewPropsOptions {
  backupItems: BackupListItemDto[];
  energyState: EnergyDto | null;
  mediaState: DefaultMediaDto | null;
  onSelectSection: (nextSection: SettingsSectionViewModel["key"], targetId?: string) => void;
  pinActive: boolean;
  selectedFavoriteCount: number;
  sgccLoginQrCode: SgccLoginQrCodeStatusDto | null;
  systemConnectionStatus: string;
  terminalTokenConfigured: boolean;
}

export function useSettingsOverviewProps({
  backupItems,
  energyState,
  mediaState,
  onSelectSection,
  pinActive,
  selectedFavoriteCount,
  sgccLoginQrCode,
  systemConnectionStatus,
  terminalTokenConfigured,
}: UseSettingsOverviewPropsOptions) {
  const runtimeCards = useMemo(
    () =>
      buildSettingsRuntimeCards({
        backupItems,
        energyState,
        mediaState,
        sgccLoginQrCode,
        systemConnectionStatus,
        terminalTokenConfigured,
      }),
    [
      backupItems,
      energyState,
      mediaState,
      sgccLoginQrCode,
      systemConnectionStatus,
      terminalTokenConfigured,
    ],
  );
  const mediaStatus =
    mediaState?.display_name ??
    runtimeCards.find((card) => card.key === "media")?.status ??
    "未设置";
  const sgccStatus = sgccLoginQrCode?.phase ?? sgccLoginQrCode?.status ?? "UNKNOWN";

  return {
    mediaStatus,
    overviewProps: {
      backupCount: backupItems.length,
      onSelectSection,
      pinActive,
      runtimeCards,
      selectedFavoriteCount,
    },
    sgccStatus,
  };
}
