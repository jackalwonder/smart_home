import { useCallback, useMemo, useState } from "react";
import { useSettingsBackups } from "./useSettingsBackups";

interface UseSettingsBackupSectionOptions {
  canEdit: boolean;
  onBackupRestored: () => Promise<void>;
}

export function useSettingsBackupSection({
  canEdit,
  onBackupRestored,
}: UseSettingsBackupSectionOptions) {
  const backups = useSettingsBackups({ canEdit, onBackupRestored });
  const [showDetails, setShowDetails] = useState(false);

  const toggleDetails = useCallback(() => {
    setShowDetails((current) => !current);
  }, []);

  const resetDetails = useCallback(() => {
    setShowDetails(false);
  }, []);

  const loadDetails = useCallback(async () => {
    await Promise.all([backups.loadBackups(), backups.loadRestoreAudits()]);
  }, [backups.loadBackups, backups.loadRestoreAudits]);

  const summaryRows = useMemo(
    () => [
      { label: "可用备份", value: `${backups.items.length} 条` },
      { label: "恢复审计", value: `${backups.restoreAudits.length} 条` },
      {
        label: "详情列表",
        value: showDetails ? "已展开" : "已收起",
      },
    ],
    [backups.items.length, backups.restoreAudits.length, showDetails],
  );

  const compactOverviewRows = useMemo(
    () => [
      { label: "可用备份", value: `${backups.items.length} 条` },
      { label: "恢复审计", value: `${backups.restoreAudits.length} 条` },
      {
        label: "详情列表",
        value: showDetails ? "已展开" : "已收起",
      },
      { label: "PIN", value: canEdit ? "已验证" : "待验证" },
    ],
    [backups.items.length, backups.restoreAudits.length, canEdit, showDetails],
  );

  return {
    ...backups,
    compactOverviewRows,
    loadDetails,
    resetDetails,
    showDetails,
    summaryRows,
    toggleDetails,
  };
}
