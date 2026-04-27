import { useState } from "react";
import { BackupListItemDto, BackupRestoreAuditItemDto } from "../../api/types";
import { AuditTimeline } from "../shared/AuditTimeline";
import { RestoreConfirmPanel } from "./RestoreConfirmPanel";
import { formatDateTime, formatShortId } from "../../utils/formatting";
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

function formatVersion(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  const match = value.match(/(\d{8})(\d{6})/);
  if (!match) {
    return value;
  }
  const [, date, time] = match;
  return `${Number(date.slice(4, 6))}月${Number(date.slice(6, 8))}日 ${time.slice(0, 2)}:${time.slice(2, 4)}`;
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
    return formatVersion(snapshotVersion);
  }
  if (matchesCurrent) {
    return `${formatVersion(snapshotVersion)}，与当前一致`;
  }
  return `${formatVersion(snapshotVersion)}，当前为 ${formatVersion(currentVersion)}`;
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

function formatBackupStatus(status: string) {
  if (status === "READY") {
    return "可恢复";
  }
  if (status === "INVALID") {
    return "不可恢复";
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
  const pendingRestore = backups.find((backup) => backup.backup_id === pendingRestoreId);

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

      {canEdit ? null : <p className="inline-error">创建或恢复备份前，请先验证管理 PIN。</p>}
      {message ? <p className="inline-success">{message}</p> : null}

      <div className="backup-list" aria-label="备份列表">
        {backups.length ? (
          backups.map((backup) => (
            <div className="backup-list__row" key={backup.backup_id}>
              <div className="backup-list__summary">
                <strong>{formatShortId(backup.backup_id, 14, 10)}</strong>
                <span>{backup.note || "无备注"}</span>
              </div>
              <div className="backup-snapshot" aria-label={`快照摘要 ${backup.backup_id}`}>
                <div className="backup-snapshot__header">
                  <strong>快照摘要</strong>
                  <span>{formatSnapshotStatus(backup.summary.snapshot_status)}</span>
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
                      ，功能设置 {backup.summary.has_function_settings ? "有" : "无"}
                      ，背景图 {backup.summary.has_background_asset ? "有" : "无"}
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
                  <dd>{formatBackupStatus(backup.status)}</dd>
                </div>
                <div>
                  <dt>创建人</dt>
                  <dd>{backup.created_by ?? "-"}</dd>
                </div>
              </dl>
              {pendingRestoreId === backup.backup_id && pendingRestore ? (
                <RestoreConfirmPanel
                  backup={pendingRestore}
                  busy={restoreBusyId !== null}
                  onCancel={() => setPendingRestoreId(null)}
                  onConfirm={() => {
                    onRestoreBackup(pendingRestore);
                    setPendingRestoreId(null);
                  }}
                />
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
                  {restoreBusyId === backup.backup_id ? "恢复中..." : "准备恢复"}
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

      <AuditTimeline
        ariaLabel="恢复历史"
        canEdit={canEdit}
        emptyLabel={auditLoading ? "正在加载恢复历史。" : "当前还没有恢复审计记录。"}
        items={restoreAudits}
        loading={auditLoading}
        loadingLabel="刷新中..."
        refreshLabel="刷新历史"
        sectionDescription="按最近恢复时间查看审计记录和恢复后的版本。"
        sectionTitle="恢复历史"
        getItemKey={(audit) => audit.audit_id}
        renderItem={(audit) => (
          <>
            <div className="backup-audit__summary">
              <strong>{formatShortId(audit.backup_id, 14, 10)}</strong>
              <span>{formatDateTime(audit.restored_at)}</span>
            </div>
            <dl className="backup-audit__meta">
              <div>
                <dt>记录编号</dt>
                <dd>{formatShortId(audit.audit_id, 14, 10)}</dd>
              </div>
              <div>
                <dt>设置版本</dt>
                <dd>{formatVersion(audit.settings_version)}</dd>
              </div>
              <div>
                <dt>布局版本</dt>
                <dd>{formatVersion(audit.layout_version)}</dd>
              </div>
              <div>
                <dt>操作人</dt>
                <dd>{audit.operator_name ?? audit.operator_id ?? "-"}</dd>
              </div>
              <div>
                <dt>终端</dt>
                <dd>{formatShortId(audit.terminal_id, 14, 10)}</dd>
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
          </>
        )}
        onRefresh={onRefreshAudits}
      />
    </SettingsModuleCard>
  );
}
