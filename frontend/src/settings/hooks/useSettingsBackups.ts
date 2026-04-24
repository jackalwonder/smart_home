import { useCallback, useState } from "react";
import {
  createBackup,
  fetchBackupRestoreAudits,
  fetchBackups,
  restoreBackup,
} from "../../api/backupsApi";
import { normalizeApiError } from "../../api/httpClient";
import type {
  BackupListItemDto,
  BackupRestoreAuditItemDto,
} from "../../api/types";

interface UseSettingsBackupsOptions {
  canEdit: boolean;
  onBackupRestored: () => Promise<void>;
}

export function useSettingsBackups({
  canEdit,
  onBackupRestored,
}: UseSettingsBackupsOptions) {
  const [items, setItems] = useState<BackupListItemDto[]>([]);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [restoreAudits, setRestoreAudits] = useState<BackupRestoreAuditItemDto[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [restoreBusyId, setRestoreBusyId] = useState<string | null>(null);

  const loadBackups = useCallback(async () => {
    if (!canEdit) {
      setItems([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetchBackups();
      setItems(response.items);
    } catch (error) {
      setMessage(normalizeApiError(error).message);
    } finally {
      setLoading(false);
    }
  }, [canEdit]);

  const loadRestoreAudits = useCallback(async () => {
    if (!canEdit) {
      setRestoreAudits([]);
      return;
    }

    setAuditLoading(true);
    try {
      const response = await fetchBackupRestoreAudits();
      setRestoreAudits(response.items);
    } catch (error) {
      setMessage(normalizeApiError(error).message);
    } finally {
      setAuditLoading(false);
    }
  }, [canEdit]);

  const create = useCallback(async () => {
    if (!canEdit) {
      setMessage("创建备份前，请先验证管理 PIN。");
      return;
    }

    setMessage(null);
    setCreateBusy(true);
    try {
      const response = await createBackup({
        note: note.trim() || undefined,
      });
      setNote("");
      setMessage(`备份 ${response.backup_id} 已创建。`);
      await loadBackups();
    } catch (error) {
      setMessage(normalizeApiError(error).message);
    } finally {
      setCreateBusy(false);
    }
  }, [canEdit, loadBackups, note]);

  const restore = useCallback(
    async (backup: BackupListItemDto) => {
      if (!canEdit) {
        setMessage("恢复备份前，请先验证管理 PIN。");
        return;
      }
      const summary = backup.summary;
      const comparison = backup.comparison;
      const confirmCopy = [
        `恢复备份 ${backup.backup_id} 会生成新的设置和布局版本。`,
        `快照设置版本 ${summary.settings_version ?? "-"}，当前 ${comparison.current_settings_version ?? "-"}。`,
        `快照布局版本 ${summary.layout_version ?? "-"}，当前 ${comparison.current_layout_version ?? "-"}。`,
        `包含首页常用 ${summary.favorite_count} 个，热点 ${summary.hotspot_count} 个。`,
        "是否继续？",
      ].join("\n");
      if (!window.confirm(confirmCopy)) {
        return;
      }

      setMessage(null);
      setRestoreBusyId(backup.backup_id);
      try {
        const response = await restoreBackup(backup.backup_id);
        setMessage(
          `恢复完成，audit_id ${response.audit_id}，settings_version ${response.settings_version}。`,
        );
        await Promise.all([onBackupRestored(), loadBackups(), loadRestoreAudits()]);
      } catch (error) {
        setMessage(normalizeApiError(error).message);
        await loadRestoreAudits();
      } finally {
        setRestoreBusyId(null);
      }
    },
    [canEdit, loadBackups, loadRestoreAudits, onBackupRestored],
  );

  return {
    auditLoading,
    create,
    createBusy,
    items,
    loadBackups,
    loadRestoreAudits,
    loading,
    message,
    note,
    restore,
    restoreAudits,
    restoreBusyId,
    setNote,
  };
}
