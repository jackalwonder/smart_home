import { BackupListItemDto } from "../../api/types";
import { SettingsModuleCard } from "./SettingsModuleCard";

interface BackupManagementPanelProps {
  backups: BackupListItemDto[];
  canEdit: boolean;
  createBusy: boolean;
  loading: boolean;
  message: string | null;
  note: string;
  restoreBusyId: string | null;
  onChangeNote: (value: string) => void;
  onCreateBackup: () => void;
  onRefresh: () => void;
  onRestoreBackup: (backupId: string) => void;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

export function BackupManagementPanel({
  backups,
  canEdit,
  createBusy,
  loading,
  message,
  note,
  restoreBusyId,
  onChangeNote,
  onCreateBackup,
  onRefresh,
  onRestoreBackup,
}: BackupManagementPanelProps) {
  return (
    <SettingsModuleCard
      description="保存当前设置和布局快照，必要时恢复到新的正式版本。"
      eyebrow="恢复点"
      title="备份恢复"
    >
      <div className="backup-panel__toolbar">
        <label className="form-field backup-panel__note">
          <span>备份备注</span>
          <input
            className="control-input"
            onChange={(event) => onChangeNote(event.target.value)}
            placeholder="例如：联调前、夜间稳定版"
            value={note}
          />
        </label>
        <div className="settings-module-card__actions">
          <button
            className="button button--ghost"
            disabled={!canEdit || loading || createBusy}
            onClick={onRefresh}
            type="button"
          >
            {loading ? "刷新中..." : "刷新列表"}
          </button>
          <button
            className="button button--primary"
            disabled={!canEdit || createBusy || loading}
            onClick={onCreateBackup}
            type="button"
          >
            {createBusy ? "创建中..." : "创建备份"}
          </button>
        </div>
      </div>

      {canEdit ? null : (
        <p className="inline-error">创建或恢复备份前，请先验证管理 PIN。</p>
      )}
      {message ? <p className="inline-success">{message}</p> : null}

      <div className="backup-list" aria-label="备份列表">
        {backups.length ? (
          backups.map((backup) => (
            <div className="backup-list__row" key={backup.backup_id}>
              <div className="backup-list__summary">
                <strong>{backup.backup_id}</strong>
                <span>{backup.note || "无备注"}</span>
              </div>
              <dl className="backup-list__meta">
                <div>
                  <dt>创建时间</dt>
                  <dd>{formatDateTime(backup.created_at)}</dd>
                </div>
                <div>
                  <dt>恢复时间</dt>
                  <dd>{formatDateTime(backup.restored_at)}</dd>
                </div>
                <div>
                  <dt>状态</dt>
                  <dd>{backup.status}</dd>
                </div>
                <div>
                  <dt>创建人</dt>
                  <dd>{backup.created_by ?? "-"}</dd>
                </div>
              </dl>
              <button
                className="button button--ghost"
                disabled={!canEdit || restoreBusyId !== null || backup.status !== "READY"}
                onClick={() => onRestoreBackup(backup.backup_id)}
                type="button"
              >
                {restoreBusyId === backup.backup_id ? "恢复中..." : "恢复此备份"}
              </button>
            </div>
          ))
        ) : (
          <p className="backup-list__empty">
            {loading ? "正在加载备份列表。" : "当前还没有备份。"}
          </p>
        )}
      </div>
    </SettingsModuleCard>
  );
}
