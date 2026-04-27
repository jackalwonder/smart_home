import type { BackupListItemDto } from "../../api/types";

interface RestoreConfirmPanelProps {
  backup: BackupListItemDto;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function RestoreConfirmPanel({
  backup,
  busy,
  onCancel,
  onConfirm,
}: RestoreConfirmPanelProps) {
  return (
    <div className="backup-restore-confirm" role="alert">
      <div>
        <strong>确认恢复 {backup.backup_id}</strong>
        <p className="muted-copy">
          恢复会生成新的设置和布局版本。快照设置版本{" "}
          {backup.summary.settings_version ?? "-"}，当前{" "}
          {backup.comparison.current_settings_version ?? "-"}；
          快照布局版本 {backup.summary.layout_version ?? "-"}，当前{" "}
          {backup.comparison.current_layout_version ?? "-"}。
        </p>
      </div>
      <div className="settings-module-card__actions">
        <button
          className="button button--ghost"
          disabled={busy}
          onClick={onCancel}
          type="button"
        >
          取消
        </button>
        <button
          className="button button--primary"
          disabled={busy}
          onClick={onConfirm}
          type="button"
        >
          {busy ? "恢复中..." : "确认恢复"}
        </button>
      </div>
    </div>
  );
}
