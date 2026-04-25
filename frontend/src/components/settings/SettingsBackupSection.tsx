import type { ComponentProps } from "react";
import { BackupManagementPanel } from "./BackupManagementPanel";
import { SettingsSectionSummaryBlock } from "./SettingsSectionSummaryBlock";

interface SettingsBackupSectionProps {
  backupAuditLoading: boolean;
  backupCreateBusy: boolean;
  backupItems: ComponentProps<typeof BackupManagementPanel>["backups"];
  backupLoading: boolean;
  backupMessage: string | null;
  backupNote: string;
  backupReadyCount: number;
  backupRestoreAudits: ComponentProps<typeof BackupManagementPanel>["restoreAudits"];
  backupRestoreBusyId: string | null;
  handleCreateBackup: () => void;
  handleRestoreBackup: ComponentProps<typeof BackupManagementPanel>["onRestoreBackup"];
  loadBackupRestoreAudits: () => void;
  loadBackups: () => void;
  pinActive: boolean;
  setBackupNote: (value: string) => void;
}

export function SettingsBackupSection({
  backupAuditLoading,
  backupCreateBusy,
  backupItems,
  backupLoading,
  backupMessage,
  backupNote,
  backupReadyCount,
  backupRestoreAudits,
  backupRestoreBusyId,
  handleCreateBackup,
  handleRestoreBackup,
  loadBackupRestoreAudits,
  loadBackups,
  pinActive,
  setBackupNote,
}: SettingsBackupSectionProps) {
  return (
    <section className="settings-section-stack">
      <SettingsSectionSummaryBlock
        rows={[
          { label: "可用备份", value: `${backupReadyCount} 条` },
          { label: "备份总数", value: `${backupItems.length} 条` },
          { label: "恢复审计", value: `${backupRestoreAudits.length} 条` },
        ]}
        actions={
          <button
            className="button button--primary"
            disabled={!pinActive || backupCreateBusy || backupLoading}
            onClick={handleCreateBackup}
            type="button"
          >
            {backupCreateBusy ? "创建中..." : "立即创建备份"}
          </button>
        }
      />
      <div id="settings-module-backup">
        <BackupManagementPanel
          auditLoading={backupAuditLoading}
          backups={backupItems}
          canEdit={pinActive}
          createBusy={backupCreateBusy}
          loading={backupLoading}
          message={backupMessage}
          note={backupNote}
          onChangeNote={setBackupNote}
          onCreateBackup={handleCreateBackup}
          onRefreshAudits={loadBackupRestoreAudits}
          onRefresh={loadBackups}
          onRestoreBackup={handleRestoreBackup}
          restoreAudits={backupRestoreAudits}
          restoreBusyId={backupRestoreBusyId}
        />
      </div>
    </section>
  );
}
