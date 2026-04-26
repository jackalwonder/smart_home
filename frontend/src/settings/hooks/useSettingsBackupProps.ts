import type { BackupListItemDto } from "../../api/types";
import { useSettingsBackupSection } from "./useSettingsBackupSection";

interface UseSettingsBackupPropsOptions {
  canEdit: boolean;
  onBackupRestored: () => Promise<void>;
}

export function useSettingsBackupProps({
  canEdit,
  onBackupRestored,
}: UseSettingsBackupPropsOptions) {
  const backup = useSettingsBackupSection({
    canEdit,
    onBackupRestored,
  });
  const backupReadyCount = backup.items.filter((item) => item.status === "READY").length;

  return {
    backupItems: backup.items,
    loadBackupDetails: backup.loadDetails,
    loadBackups: backup.loadBackups,
    loadBackupRestoreAudits: backup.loadRestoreAudits,
    resetBackupDetails: backup.resetDetails,
    backupProps: {
      backupAuditLoading: backup.auditLoading,
      backupCreateBusy: backup.createBusy,
      backupItems: backup.items,
      backupLoading: backup.loading,
      backupMessage: backup.message,
      backupNote: backup.note,
      backupReadyCount,
      backupRestoreAudits: backup.restoreAudits,
      backupRestoreBusyId: backup.restoreBusyId,
      handleCreateBackup: () => void backup.create(),
      handleRestoreBackup: (item: BackupListItemDto) => void backup.restore(item),
      loadBackupRestoreAudits: () => void backup.loadRestoreAudits(),
      loadBackups: () => void backup.loadBackups(),
      pinActive: canEdit,
      setBackupNote: backup.setNote,
    },
  };
}
