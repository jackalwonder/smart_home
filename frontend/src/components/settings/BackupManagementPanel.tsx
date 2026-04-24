import { useState } from "react";
import { BackupListItemDto, BackupRestoreAuditItemDto } from "../../api/types";
import { SettingsModuleCard } from "./SettingsModuleCard";

interface BackupManagementPanelProps {
  auditLoading: boolean;
  backups: BackupListItemDto[];
  canEdit: boolean;
  createBusy: boolean;
  loading: boolean;
  message: string | null;
  note: string;
  restoreAudits: BackupRestoreAuditItemDto[];
  restoreBusyId: string | null;
  onChangeNote: (value: string) => void;
  onCreateBackup: () => void;
  onRefresh: () => void;
  onRefreshAudits: () => void;
  onRestoreBackup: (backup: BackupListItemDto) => void;
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

function formatRestoreResult(status: string) {
  if (status === "SUCCESS") {
    return "成功";
  }
  if (status === "FAILED") {
    return "失败";
  }
  return status;
}

function formatRestoreFailure(audit: BackupRestoreAuditItemDto) {
  if (audit.result_status === "SUCCESS") {
    return "-";
  }
  if (audit.failure_reason === "not_found") {
    return "备份不存在或快照缺失";
  }
  if (audit.failure_reason === "status_not_ready") {
    return "备份状态不允许恢复";
  }
  if (audit.failure_reason === "invalid_json") {
    return "备份快照不是有效 JSON";
  }
  if (audit.failure_reason?.startsWith("must_be_")) {
    return "备份快照结构不完整";
  }
  return audit.error_message ?? audit.error_code ?? "恢复失败";
}

function formatSnapshotVersion(
  snapshotVersion: string | null | undefined,
  currentVersion: string | null | undefined,
  matchesCurrent: boolean,
) {
  if (!snapshotVersion) {
    return "无版本";
  }
  if (!currentVersion) {
    return snapshotVersion;
  }
  if (matchesCurrent) {
    return `${snapshotVersion}，与当前一致`;
  }
  return `${snapshotVersion}，当前为 ${currentVersion}`;
}

function formatSnapshotStatus(status: string) {
  if (status === "READY") {
    return "可预览";
  }
  if (status === "INVALID") {
    return "快照异常";
  }
  return status;
}

export function BackupManagementPanel({
  auditLoading,
  backups,
  canEdit,
  createBusy,
  loading,
  message,
  note,
  restoreAudits,
  restoreBusyId,
  onChangeNote,
  onCreateBackup,
  onRefresh,
  onRefreshAudits,
  onRestoreBackup,
}: BackupManagementPanelProps) {
  const [pendingRestoreId, setPendingRestoreId] = useState<string | null>(null);
  const pendingRestore = backups.find(
    (backup) => backup.backup_id === pendingRestoreId,
  );

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
              <div
                className="backup-snapshot"
                aria-label={`快照摘要 ${backup.backup_id}`}
              >
                <div className="backup-snapshot__header">
                  <strong>快照摘要</strong>
                  <span>
                    {formatSnapshotStatus(backup.summary.snapshot_status)}
                  </span>
                </div>
                <dl className="backup-snapshot__grid">
                  <div>
                    <dt>设置版本</dt>
                    <dd>
                      {formatSnapshotVersion(
                        backup.summary.settings_version,
                        backup.comparison.current_settings_version,
                        backup.comparison.settings_matches_current,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>布局版本</dt>
                    <dd>
                      {formatSnapshotVersion(
                        backup.summary.layout_version,
                        backup.comparison.current_layout_version,
                        backup.comparison.layout_matches_current,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>内容数量</dt>
                    <dd>
                      首页常用 {backup.summary.favorite_count}，热点{" "}
                      {backup.summary.hotspot_count}
                    </dd>
                  </div>
                  <div>
                    <dt>包含内容</dt>
                    <dd>
                      页面设置 {backup.summary.has_page_settings ? "有" : "无"}
                      ，功能设置{" "}
                      {backup.summary.has_function_settings ? "有" : "无"}
                      ，背景图{" "}
                      {backup.summary.has_background_asset ? "有" : "无"}
                    </dd>
                  </div>
                </dl>
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
              {pendingRestoreId === backup.backup_id && pendingRestore ? (
                <div className="backup-restore-confirm" role="alert">
                  <div>
                    <strong>确认恢复 {pendingRestore.backup_id}</strong>
                    <p className="muted-copy">
                      恢复会生成新的设置和布局版本。快照设置版本{" "}
                      {pendingRestore.summary.settings_version ?? "-"}，当前{" "}
                      {pendingRestore.comparison.current_settings_version ?? "-"}；
                      快照布局版本{" "}
                      {pendingRestore.summary.layout_version ?? "-"}，当前{" "}
                      {pendingRestore.comparison.current_layout_version ?? "-"}。
                    </p>
                  </div>
                  <div className="settings-module-card__actions">
                    <button
                      className="button button--ghost"
                      disabled={restoreBusyId !== null}
                      onClick={() => setPendingRestoreId(null)}
                      type="button"
                    >
                      取消
                    </button>
                    <button
                      className="button button--primary"
                      disabled={restoreBusyId !== null}
                      onClick={() => {
                        onRestoreBackup(pendingRestore);
                        setPendingRestoreId(null);
                      }}
                      type="button"
                    >
                      {restoreBusyId === pendingRestore.backup_id
                        ? "恢复中..."
                        : "确认恢复"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="button button--ghost"
                  disabled={
                    !canEdit ||
                    restoreBusyId !== null ||
                    backup.status !== "READY" ||
                    backup.summary.snapshot_status !== "READY"
                  }
                  onClick={() => setPendingRestoreId(backup.backup_id)}
                  type="button"
                >
                  {restoreBusyId === backup.backup_id
                    ? "恢复中..."
                    : "准备恢复"}
                </button>
              )}
            </div>
          ))
        ) : (
          <p className="backup-list__empty">
            {loading ? "正在加载备份列表。" : "当前还没有备份。"}
          </p>
        )}
      </div>

      <section className="backup-audit" aria-label="恢复历史">
        <div className="backup-audit__header">
          <div>
            <h4>恢复历史</h4>
            <p className="muted-copy">
              按最近恢复时间查看审计记录和恢复后的版本。
            </p>
          </div>
          <button
            className="button button--ghost"
            disabled={!canEdit || auditLoading}
            onClick={onRefreshAudits}
            type="button"
          >
            {auditLoading ? "刷新中..." : "刷新历史"}
          </button>
        </div>
        <div className="backup-audit__timeline">
          {restoreAudits.length ? (
            restoreAudits.map((audit) => (
              <article className="backup-audit__item" key={audit.audit_id}>
                <div className="backup-audit__summary">
                  <strong>{audit.backup_id}</strong>
                  <span>{formatDateTime(audit.restored_at)}</span>
                </div>
                <dl className="backup-audit__meta">
                  <div>
                    <dt>审计 ID</dt>
                    <dd>{audit.audit_id}</dd>
                  </div>
                  <div>
                    <dt>设置版本</dt>
                    <dd>{audit.settings_version ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>布局版本</dt>
                    <dd>{audit.layout_version ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>操作人</dt>
                    <dd>{audit.operator_name ?? audit.operator_id ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>终端</dt>
                    <dd>{audit.terminal_id ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>结果</dt>
                    <dd>{formatRestoreResult(audit.result_status)}</dd>
                  </div>
                  <div>
                    <dt>失败原因</dt>
                    <dd>{formatRestoreFailure(audit)}</dd>
                  </div>
                </dl>
              </article>
            ))
          ) : (
            <p className="backup-list__empty">
              {auditLoading ? "正在加载恢复历史。" : "当前还没有恢复审计记录。"}
            </p>
          )}
        </div>
      </section>
    </SettingsModuleCard>
  );
}
